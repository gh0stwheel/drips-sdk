import { ethers as Ethers, BigNumber as bn } from 'ethers'
import Web3Modal from 'web3modal'
import WalletConnectProvider from '@walletconnect/web3-provider'

console.log("Hello World Write")

// Define network-related constants
const networks = {
  1: { name: 'mainnet', layer: 'ethereum', infura: 'wss://mainnet.infura.io/ws/v3/1cf5614cae9f49968fe604b818804be6', explorer: { name: 'Etherscan', domain: 'https://etherscan.io' } },
  4: { name: 'rinkeby', layer: 'ethereum', infura: 'wss://rinkeby.infura.io/ws/v3/1cf5614cae9f49968fe604b818804be6', explorer: { name: 'Etherscan', domain: 'https://rinkeby.etherscan.io' } },
  137: { name: 'polygon', layer: 'polygon', infura: 'https://polygon-mainnet.infura.io/v3/1cf5614cae9f49968fe604b818804be6', explorer: { name: 'Polyscan', domain: 'https://polygonscan.com' } },
  80001: { name: 'polygon-mumbai', layer: 'polygon', infura: 'https://polygon-mumbai.infura.io/v3/1cf5614cae9f49968fe604b818804be6', explorer: { name: 'Polyscan', domain: 'https://mumbai.polygonscan.com' } }
}
const deployNetworkName = 'mainnet'
const deployNetwork = Object.values(networks).find(n => n.name === deployNetworkName)

// Wallet-related vars
let provider, signer, walletProvider, address, networkId

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

connect()


function getRadicleRegistryContract () {
  return new Ethers.Contract(RadicleRegistry.address, RadicleRegistry.abi, provider)
}

async function connect () {
  try {
    // connect and update provider, signer
    walletProvider = await web3Modal.connect()
    provider = new Ethers.providers.Web3Provider(walletProvider)
    signer = provider.getSigner()

    // set user address
    let signerAddress = await signer.getAddress()
    signIn(signerAddress)

    // set network id
    setNetworkId()

    listenToWalletProvider()

    console.log('connected to network ' + networkId + '!')

    return true
  } catch (e) {
    
    console.error('@connect', e)

    // clear wallet in case
    disconnect()

    // throw error so stops any flows (closes modal too)
    throw e
  }
}

function listenToWalletProvider () {
  if (!walletProvider?.on) return

  // account changed (or disconnected)
  walletProvider.on('accountsChanged', accounts => {
    console.log('accountsChanged', accounts)
    if (!accounts.length) {
      disconnect()
    }
    signIn(accounts[0])
  })

  // changed network
  walletProvider.on('chainChanged', chainId => {
    console.log('network changed', chainId)
    // reload page so data is correct...
    window.location.reload()
  })

  // random disconnection? (doesn't fire on account disconnect)
  walletProvider.on('disconnect', error => {
    console.error('disconnected?', error)
    disconnect()
  })
}

async function setNetworkId() {
  networkId = await provider.getNetwork().chainId
}

function signIn (signInAddress) {
  address = signInAddress.toLowerCase()
}

function signOut () {
  address = null
}

// Disconnect the wallet
function disconnect () {

  // clear so they can re-select from scratch
  web3Modal.clearCachedProvider()
  // manually clear walletconnect --- https://github.com/Web3Modal/web3modal/issues/354
  localStorage.removeItem('walletconnect')

  signOut()
  setupFallbackProvider()
  signer = null
}

async function setupFallbackProvider () {
  try {
    if (window.ethereum) {
      // metamask/browser
      provider = new Ethers.providers.Web3Provider(window.ethereum)
    } else {
      // infura fallback
      provider = new Ethers.getDefaultProvider(deployNetwork.infura)
    }
    // set network
    await setNetworkId()
    return true
  } catch (e) {
    console.error(e)
  }
}



