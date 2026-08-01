package service

import (
	"context"
	"fmt"

	"github.com/utilipay/backend/internal/models"
	"github.com/utilipay/backend/internal/provider"
	"github.com/utilipay/backend/internal/provider/aeps"
	"github.com/utilipay/backend/internal/provider/bharatconnect"
)

// BharatConnectResolver polls the Bharat Connect status API on behalf of the
// reconciliation worker.
//
// It adapts the provider client to the StatusResolver interface so the worker has
// no knowledge of any specific integration.
type BharatConnectResolver struct {
	client *bharatconnect.Client
}

// NewBharatConnectResolver builds a BharatConnectResolver.
func NewBharatConnectResolver(client *bharatconnect.Client) *BharatConnectResolver {
	return &BharatConnectResolver{client: client}
}

// ResolveStatus implements StatusResolver.
//
// The reference preference matters: the provider accepts either its own txId or
// the reqid we supplied, and our txn id is the last resort because it is only
// meaningful upstream if it was sent as the reqid.
func (r *BharatConnectResolver) ResolveStatus(ctx context.Context, txn *models.Transaction) (*StatusResult, error) {
	reference := firstNonEmptyStr(txn.ProviderTxnID, txn.ProviderRef, txn.TxnID)
	if reference == "" {
		return nil, fmt.Errorf("bharat connect resolver: transaction %s has no upstream reference", txn.TxnID)
	}

	res, err := r.client.Status(ctx, bharatconnect.StatusRequest{
		TxID:          reference,
		Attempt:       txn.StatusCheckAttempts + 1,
		TransactionID: &txn.ID,
		RetailerID:    &txn.RetailerID,
	})
	if err != nil {
		return nil, err
	}

	return &StatusResult{
		Outcome:       res.Outcome,
		ProviderTxnID: res.TxID,
		StatusCode:    firstNonEmptyStr(res.Code, res.Status),
		Message:       firstNonEmptyStr(res.Description, res.Message),
	}, nil
}

// AEPSResolver polls the AEPS status API.
//
// The provider documentation does not yet define an AEPS status endpoint, so this
// reports the operation as unavailable rather than guessing. The worker treats
// that as an inconclusive check and reschedules, and eventually escalates the
// transaction for manual review, which is the honest outcome when no automated
// resolution path exists.
type AEPSResolver struct {
	client *aeps.Client
}

// NewAEPSResolver builds an AEPSResolver.
func NewAEPSResolver(client *aeps.Client) *AEPSResolver {
	return &AEPSResolver{client: client}
}

// ResolveStatus implements StatusResolver.
func (r *AEPSResolver) ResolveStatus(ctx context.Context, txn *models.Transaction) (*StatusResult, error) {
	if !r.client.Capabilities().StatusCheck {
		return nil, fmt.Errorf("aeps resolver: %w", aeps.ErrNotImplemented)
	}

	reference := firstNonEmptyStr(txn.ProviderRef, txn.TxnID)
	res, err := r.client.CheckStatus(ctx, reference)
	if err != nil {
		return nil, err
	}

	return &StatusResult{
		Outcome:       res.Outcome,
		ProviderTxnID: res.ProviderRef,
		StatusCode:    res.StatusCode,
		Message:       res.Message,
	}, nil
}

// compile-time assertions that both resolvers satisfy the worker's interface.
var (
	_ StatusResolver = (*BharatConnectResolver)(nil)
	_ StatusResolver = (*AEPSResolver)(nil)
	_                = provider.OutcomeSuccess
)
