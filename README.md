# NFT Resolver

The NFT Resolver is intented to be used to resolve any subdomain for a specific ENS domain where a NFT collection has been deployed on Linea.  
More precisely it is ID based, meaning the resolution of an address for a subdomain is determined by the ownership of the NFT's ID on the target NFT contract on Linea.

## Setup for your own ENS domain for your own NFT collection

TODO: The NFT Resolver contract address needs to be changed to the one deployed on mainnet once deployed.

If you own an ENS domain that you want its subdomains to resolve depending on a NFT collection deployed on Linea, simply follow those steps:

1 - Get the DNS encoded name of your ENS name, you can use etherJs dnsEncode function to get it: https://docs.ethers.org/v6/api/hashing/#dnsEncode  
For example for `efrogs.eth`, the DNS encoded name is `0x066566726f67730365746800`  
2 - Get the target NFT contract you want to use to resolve the subdomains depending on the NFT's owner addresses.  
For example: [0x194395587d7b169e63eaf251e86b1892fa8f1960](https://lineascan.build/address/0x194395587d7b169e63eaf251e86b1892fa8f1960)  
3 - Go to the [NFT resolver contract](https://sepolia.etherscan.io/address/0x52992f84Af8204A84cB7F1f7106a59B14882A6E2#writeContract)  
4 - Click on `Connect to Web3`with the wallet that owns the chosen ENS name (Example `efrogs.eth`)  
5 - Click on `setTarget` and add the parameters:  
 name: [DNS encoded name of your ENS name] (Example `0x066566726f67730365746800`)  
target: [NFT contrac address on Linea] (Example `0x194395587d7b169e63eaf251e86b1892fa8f1960`)  
6 - Click on write and approve the transaction  
7 - Go the [ENS app website](https://app.ens.domains/)  
8 - Go to your ENS name profile page (Example: https://app.ens.domains/efrogs.eth)  
9 - Go to the tab `More` (Example: https://app.ens.domains/efrogs.eth?tab=more)  
10 - In the `Resolver` section at the bottom, click on `Edit`  
11 - Click on `Custom Resolver`  
12 - Add the NFT Resolver's address: `0x52992f84Af8204A84cB7F1f7106a59B14882A6E2`  
13 - Click on `Update`, `Open Wallet`and approve the transaction.

Once all those steps are done you can start resolving subdomains of your ENS domain using the NFT IDs minted on Linea.

## Tests

Run the following:

```shell
npm i
npm test
```
