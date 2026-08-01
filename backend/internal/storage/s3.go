package storage

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// S3 stores objects in an S3 bucket.
//
// This is the production backend: it survives container replacement and is shared
// across instances, neither of which is true of the local filesystem.
type S3 struct {
	client *s3.Client
	bucket string
	// prefix namespaces objects within the bucket so it can be shared with other
	// data without collisions.
	prefix string
}

// S3Options configures an S3 store.
type S3Options struct {
	Bucket string
	Region string
	Prefix string

	// Endpoint targets an S3-compatible service such as MinIO. Empty means AWS.
	Endpoint string
	// ForcePathStyle is required by most S3-compatible services, which do not
	// support virtual-host addressing.
	ForcePathStyle bool

	// AccessKeyID and SecretAccessKey are optional. When empty the SDK's default
	// chain is used, which on EC2 or ECS picks up the instance or task role. That
	// is the preferred setup: it avoids long-lived keys in the environment.
	AccessKeyID     string
	SecretAccessKey string
}

// NewS3 builds an S3-backed store and verifies the bucket is reachable.
//
// Checking at startup means a misconfigured bucket surfaces immediately rather
// than as a failed upload during a retailer's onboarding.
func NewS3(ctx context.Context, opts S3Options) (*S3, error) {
	if opts.Bucket == "" {
		return nil, errors.New("storage: S3_BUCKET is required when STORAGE_DRIVER=s3")
	}

	loadOpts := []func(*awsconfig.LoadOptions) error{}
	if opts.Region != "" {
		loadOpts = append(loadOpts, awsconfig.WithRegion(opts.Region))
	}
	if opts.AccessKeyID != "" && opts.SecretAccessKey != "" {
		loadOpts = append(loadOpts, awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(opts.AccessKeyID, opts.SecretAccessKey, ""),
		))
	}

	cfg, err := awsconfig.LoadDefaultConfig(ctx, loadOpts...)
	if err != nil {
		return nil, fmt.Errorf("storage: load aws config: %w", err)
	}

	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		if opts.Endpoint != "" {
			o.BaseEndpoint = aws.String(opts.Endpoint)
		}
		o.UsePathStyle = opts.ForcePathStyle
	})

	store := &S3{
		client: client,
		bucket: opts.Bucket,
		prefix: strings.Trim(opts.Prefix, "/"),
	}

	if _, err := client.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(opts.Bucket)}); err != nil {
		return nil, fmt.Errorf("storage: cannot reach bucket %q: %w", opts.Bucket, err)
	}
	return store, nil
}

// objectKey namespaces a key under the configured prefix.
func (s *S3) objectKey(key string) string {
	clean := strings.TrimPrefix(strings.TrimSpace(key), "/")
	if s.prefix == "" {
		return clean
	}
	return s.prefix + "/" + clean
}

// Put uploads an object.
//
// The body is buffered because S3 requires a known content length for a
// single-part upload, and these files are capped in the low megabytes.
func (s *S3) Put(ctx context.Context, key, contentType string, r io.Reader, limit int64) (int64, error) {
	var buf bytes.Buffer
	// One byte past the limit so exceeding it is detectable rather than truncated.
	written, err := io.Copy(&buf, io.LimitReader(r, limit+1))
	if err != nil {
		return 0, fmt.Errorf("storage: buffer upload: %w", err)
	}
	if written > limit {
		return 0, ErrTooLarge
	}

	_, err = s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(s.objectKey(key)),
		Body:        bytes.NewReader(buf.Bytes()),
		ContentType: aws.String(contentType),
		// Server-side encryption is applied explicitly rather than relying on a
		// bucket default, so the object is encrypted at rest even if the bucket
		// policy is later relaxed.
		ServerSideEncryption: types.ServerSideEncryptionAes256,
	})
	if err != nil {
		return 0, fmt.Errorf("storage: put object: %w", err)
	}
	return written, nil
}

// Open returns a reader for the object body.
func (s *S3) Open(ctx context.Context, key string) (io.ReadCloser, error) {
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(s.objectKey(key)),
	})
	if err != nil {
		var missing *types.NoSuchKey
		var notFound *types.NotFound
		if errors.As(err, &missing) || errors.As(err, &notFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("storage: get object: %w", err)
	}
	return out.Body, nil
}

// Delete removes the object. S3 treats a delete of a missing key as success,
// which is the behaviour the interface wants.
func (s *S3) Delete(ctx context.Context, key string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(s.objectKey(key)),
	})
	if err != nil {
		return fmt.Errorf("storage: delete object: %w", err)
	}
	return nil
}

// Describe identifies the store for logs.
func (s *S3) Describe() string {
	if s.prefix == "" {
		return "s3://" + s.bucket
	}
	return "s3://" + s.bucket + "/" + s.prefix
}
