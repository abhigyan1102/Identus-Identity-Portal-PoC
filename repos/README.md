# repos/

Reference repos cloned locally for browsing. Not committed to this repo.

To recreate:

```sh
mkdir -p repos && cd repos
git clone --depth 1 https://github.com/hyperledger-identus/sdk-ts.git
git clone --depth 1 https://github.com/hyperledger-identus/cloud-agent.git
```

The portal does not depend on these checkouts at build time — it consumes
`@hyperledger/identus-sdk` from npm. The clones are here purely so you can
read the SDK source and the Cloud Agent's REST surface alongside the portal
code while developing.
