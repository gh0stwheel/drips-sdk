import {DripsClient} from './index.js'
import Web3Modal from 'web3modal'
import WalletConnectProvider from '@walletconnect/web3-provider'

// Define network-related constants
const networks = {
  1: { name: 'mainnet', layer: 'ethereum', infura: 'wss://mainnet.infura.io/ws/v3/1cf5614cae9f49968fe604b818804be6', explorer: { name: 'Etherscan', domain: 'https://etherscan.io' } },
  4: { name: 'rinkeby', layer: 'ethereum', infura: 'wss://rinkeby.infura.io/ws/v3/1cf5614cae9f49968fe604b818804be6', explorer: { name: 'Etherscan', domain: 'https://rinkeby.etherscan.io' } },
  137: { name: 'polygon', layer: 'polygon', infura: 'https://polygon-mainnet.infura.io/v3/1cf5614cae9f49968fe604b818804be6', explorer: { name: 'Polyscan', domain: 'https://polygonscan.com' } },
  80001: { name: 'polygon-mumbai', layer: 'polygon', infura: 'https://polygon-mumbai.infura.io/v3/1cf5614cae9f49968fe604b818804be6', explorer: { name: 'Polyscan', domain: 'https://mumbai.polygonscan.com' } }
}
const deployNetworkName = 'mainnet'
const deployNetwork = Object.values(networks).find(n => n.name === deployNetworkName)

// setup web3 modal
const web3Modal = new Web3Modal({
  network: deployNetwork.name, // optional
  cacheProvider: true, // optional
  providerOptions: { // required
    walletconnect: {
      package: WalletConnectProvider, // required
      options: {
        infuraId: '1cf5614cae9f49968fe604b818804be6' // required
      }
    }
  },
  theme: 'dark'
})

let dripsClient

// Bind functions to buttons in example HTML
// TODO -- this needs to get moved out into example.js file
document.querySelector("#connect").addEventListener('click', connect);
document.querySelector("#disconnect").addEventListener('click', disconnect);
document.querySelector("#updateUserDrips").addEventListener('click', updateDripsWithInputs());

async function connect() {
  walletProvider = await web3Modal.connect()
  provider = new Ethers.providers.Web3Provider(walletProvider)

  dripsClient = new DripsClient(provider);
  dripsClient.connect()
}

function disconnect() {
  if (dripsClient) {
    dripsClient.disconnect()
  }
}

async function updateDripsWithInputs() {
  // TODO
}
