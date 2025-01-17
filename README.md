# NFT Resolver

The NFT Resolver is Intended to be used to resolve any subdomain for a specific ENS domain where a NFT collection has been deployed on Linea.  
More precisely it is ID based, meaning the resolution of an address for a subdomain is determined by the ownership of the NFT's ID on the target NFT contract on Linea.

## Setup for your own ENS domain for your own NFT collection

If you own an ENS domain that you want its subdomains to resolve depending on a NFT collection deployed on Linea, simply follow those steps:

1 - Get the DNS encoded name of your ENS name, you can use etherJs dnsEncode function to get it: https://docs.ethers.org/v6/api/hashing/#dnsEncode  
For example for `efrogs.eth`, the DNS encoded name is `0x066566726f67730365746800`

2 - Get the target NFT contract you want to use to resolve the subdomains depending on the NFT's owner addresses.  
For example: [0x194395587d7b169e63eaf251e86b1892fa8f1960](https://lineascan.build/address/0x194395587d7b169e63eaf251e86b1892fa8f1960)

3 - Get the slot in the target NFT contract that contains the owner addresses.  
Read more about slot calculation [here](https://medium.com/@ozorawachie/solidity-storage-layout-and-slots-a-comprehensive-guide-2cee71817ed8)  
If you are using hardhat for your smart contract project, you can also use the plugin [hardhat-storage-layout](https://www.npmjs.com/package/hardhat-storage-layout)  
For example for the Efrogs NFT contract the owners are stored in the slot `122`.

4 - Go to the [NFT resolver contract](https://etherscan.io/address/0x9e06380CBb5D04C722e38E9c3C7659c7c1510df3#writeContract)

5 - Click on `Connect to Web3`with the wallet that owns the chosen ENS name (Example `efrogs.eth`)

6 - Click on `setTarget` and add the parameters:  
`name`: [DNS encoded name of your ENS name] (Example `0x066566726f67730365746800`)  
`target`: [NFT contract address on Linea] (Example `0x194395587d7b169e63eaf251e86b1892fa8f1960`)  
Click on write and approve the transaction.

7 - Click on `setBaseNodeResolver` and add the parameters:  
`name`: [DNS encoded name of your ENS name] (Example `0x066566726f67730365746800`)  
`resolverAddr`: [The resolver you want to keep using for your base domain] (Example `0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63`)  
Click on write and approve the transaction.

8 - Click on `setTargetAddrSlot` and add the parameters:  
`name`: [DNS encoded name of your ENS name] (Example `0x066566726f67730365746800`)  
`slot`: [The slot in the target NFT contract that contains the owner addresses] (Example `122`)  
Click on write and approve the transaction.

9 - Go the [ENS app website](https://app.ens.domains/)

10 - Go to your ENS name profile page (Example: https://app.ens.domains/efrogs.eth)

11 - Go to the tab `More` (Example: https://app.ens.domains/efrogs.eth?tab=more)

12 - In the `Resolver` section at the bottom, click on `Edit`

13 - Click on `Custom Resolver`

14 - Add the NFT Resolver's address: `0x8210077e031302C41aCD7FccC38628CA1788A999`  
You'll get a warning but this is normal.

15 - Click on `Update`, `Open Wallet`and approve the transaction.

Once all those steps are done you can start resolving subdomains of your ENS domain using the NFT IDs minted on Linea.

## Tests

Run the following:

```shell
npm i
npm test
```
