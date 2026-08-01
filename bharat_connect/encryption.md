Hi Team

As part of onboarding the new service, find the required details below.

This information is confidential and intended only for the addressed recipient.

1. Authentication – Client Credentials

Use the following Client ID and Client Secret to generate the authentication token via the API in the document:

Authentication & Token Generation API

{
        "clientId": "[REDACTED — see BC_CLIENT_ID in backend/.env]",
        "clientSecret": "[REDACTED — see BC_CLIENT_SECRET in backend/.env]",
}

> The live credentials were removed before this repository was first committed.
> They are configured through `BC_CLIENT_ID` and `BC_CLIENT_SECRET` in
> `backend/.env`, which is gitignored. Git history is permanent, so a secret
> committed once has to be rotated with the provider rather than deleted.

2. Encryption Credentials

The RSA public key was shared separately on your registered email ID. 

key_version: 1.0

public_key_base64: MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlHpOvQI7LvtOmK5jRfqvoUbJtlVVIbez31E0G7tNrCpOtwsV08yc1GYBqG4zSicvsMHUiCkvdeB4Eo0pXEcV5Gw7swMXUT/LkAQVm0L8JYpUVkZmAORVDpHCVX1kJP9mAaRVtkt6BItZQXcUBO7ykNJOY2hItZfVzyapXn7WfB+BV7Bbu+MiJKGJM3VYKHsokAFi36g3dSlVG2NCKD+q4wzhCZGygkYlAkmcBarbizYbATu2kkqWz1oCqClwIxwRUNh5chVu/vbyvgTcGYfA0IehcJePcX6+NVtAFsuifvdscnG93inJXpeJnbUEqcGMzdvsVwSit7eDZKoUW8WuOwIDAQAB