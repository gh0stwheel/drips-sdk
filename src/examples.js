import { DripsClient } from './index.js'
import { getDripsBySender } from './api.js'
import { toWei,toWeiPerSec } from './utils.js'
import { ethers as Ethers, BigNumber as bn } from 'ethers'
import Web3Modal from 'web3modal'
import WalletConnectProvider from '@walletconnect/web3-provider'

// Define network-related constants
const networks = {
  1: { name: 'mainnet', layer: 'ethereum', infura: 'wss://mainnet.infura.io/ws/v3/1cf5614cae9f49968fe604b818804be6', explorer: { name: 'Etherscan', domain: 'https://etherscan.io' } },
  4: { name: 'rinkeby', layer: 'ethereum', infura: 'wss://rinkeby.infura.io/ws/v3/1cf5614cae9f49968fe604b818804be6', explorer: { name: 'Etherscan', domain: 'https://rinkeby.etherscan.io' } },
  137: { name: 'polygon', layer: 'polygon', infura: 'https://polygon-mainnet.infura.io/v3/1cf5614cae9f49968fe604b818804be6', explorer: { name: 'Polyscan', domain: 'https://polygonscan.com' } },
  80001: { name: 'polygon-mumbai', layer: 'polygon', infura: 'https://polygon-mumbai.infura.io/v3/1cf5614cae9f49968fe604b818804be6', explorer: { name: 'Polyscan', domain: 'https://mumbai.polygonscan.com' } }
}
//const deployNetworkName = 'rinkeby'
//const deployNetwork = Object.values(networks).find(n => n.name === deployNetworkName)

// Setup web3 modal
const web3Modal = new Web3Modal({
  //network: deployNetwork.name, // optional
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

function getNetworkName ( networkId ) {
  return networks[networkId].name
}

async function connect () {
  try {
    walletProvider = await web3Modal.connect()
    provider = new Ethers.providers.Web3Provider(walletProvider)
  
    dripsClient = new DripsClient(provider);
    await dripsClient.connect()
  
    displayAddressAndNetwork()
    displayUserDrips()
    
  } catch (e) {
    console.log(e)
    responseText.textContent = e.data?.message || e.message || e
  }
}

function disconnect () {
  // clear so they can re-select from scratch
  web3Modal.clearCachedProvider()
  // manually clear walletconnect --- https://github.com/Web3Modal/web3modal/issues/354
  localStorage.removeItem('walletconnect')

  if (dripsClient) {
    dripsClient.disconnect()
  }

  displayAddressAndNetwork()
  displayUserDrips()
}

async function displayAddressAndNetwork () {
  console.log('in displayAddressAndNetwork')
  if (dripsClient) {
    const addressDiv = document.getElementById('address');
    let address = dripsClient.address;
    if (address) {
      addressDiv.textContent = 'Address: ' + address
    } else {
      addressDiv.textContent = 'Address: [Not Connected]'
    }
    
    const networkDiv = document.getElementById('network');
    let network = dripsClient.networkId;
    if (network) {
      networkDiv.textContent = 'Network: ' + getNetworkName(network);
    } else {
      networkDiv.textContent = 'Network: [Not Connected]'
    }
  }
}

async function displayUserDrips () {
  const div = document.getElementById('userDrips');
  if (dripsClient && dripsClient.address) {
    console.log(dripsClient.getAddress())
    let userDripsJson = await getDripsBySender(dripsClient.getAddress())
    console.log(userDripsJson)
    div.textContent = JSON.stringify(userDripsJson);
  } else {
    div.textContent = ""
  }
}

async function updateDripsWithInputs () {
  try {
    let responseText = document.getElementById("responseText")

    let topUpDai = document.getElementById("topUpDai").value
    console.log('topUpDai -->' + topUpDai)
    const topUpWei = toWei(Number(topUpDai))

    if (!dripsClient) throw 'Please connect the wallet first'

    // check allowance if top-up
    if (topUpWei.gt(0)) {
      const allowance = await dripsClient.getAllowance(dripsClient.getAddress())

      console.log('allowance -->' + allowance)

      // !! below allowance
      if (allowance.lt(topUpWei)) {
        responseText.value = 'You must first approve the contract to be able to withdraw your DAI.'
        approved.value = false
        approveVisible.value = true
        return false
      }
    }

    // get the current drips configuration for the address
    let userDripsJson = await getDripsBySender(dripsClient.getAddress())

    // check max if withdrawing
    if (topUpWei.lt(0)) {
      let withdrawable = userDripsJson.withdrawable
      // !! can't withdraw that much
      if (topUpWei.abs().gt(withdrawable)) {
        responseText.value = `You can't withdraw that much DAI.`
        return false
      }
    }

    // validate receivers
    
    // TODO -- need to generalize to support multiple drip receivers and then delete the commented code below
    let dripToAddressInput = document.getElementById("dripToAddress").value
    let dripToDAIInput = document.getElementById("dripToDAI").value


    let newReceivers = []
    if (dripToAddressInput !== "" && dripToDAIInput !== "") {
      const dripToAddress = dripsClient.validateAddressInput(dripToAddressInput)
      const amtWeiPerSec = toWeiPerSec(dripToDAIInput)
      newReceivers.push([dripToAddress, amtamtWeiPerSecPerSec])
    }

    /*
    for (var i = 0; i < drips.value.length; i++) {
      // validate address input...
      const address = await validateAddressInput(drips.value[i].receiverInput)
      // convert rate to wei
      const amtPerSec = toWeiPerSec(drips.value[i].amount)
      // add
      newReceivers.push([address, amtPerSec])
    }
    // sort by address
    newReceivers = newReceivers.sort((a, b) => (a[0] - b[0]))
    */

    // submit...
    responseText.value = { message: 'Confirm the transaction in your wallet.' }
    let tx
    let txReceipt

    let txResponse = await dripsClient.updateUserDrips (
      userDripsJson.timestamp,
      userDripsJson.balance,
      userDripsJson.receivers,
      topUpWei,
      newReceivers )
    
    console.log('Waiting for the transaction to confirm...')

    // wait for tx...
    responseText.value = { message: 'Waiting for transaction confirmation...' }
    txReceipt = await txResponse.wait()

    console.log('Confirmed!')

    // confirmed!
    responseText.value = { status: 1, message: 'Confirmed! View your drips on your profile.' }
    txResponse = null

    // TODO -- refresh balance and Drips displays in the Gui

  } catch (e) {
    console.log(e)
    console.log(e.stack)
    responseText.textContent = e.data?.message || e.message || e
  }
}


// Bind functions to buttons in example HTML
document.querySelector("#connect").addEventListener('click', connect);
document.querySelector("#disconnect").addEventListener('click', disconnect);
document.querySelector("#updateUserDrips").addEventListener('click', updateDripsWithInputs);