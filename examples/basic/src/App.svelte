<script lang="ts">
  import { onMount } from 'svelte';
  import { DripsClient, getDripsBySender, getSplitsBySender, getDripsByReceiver, toWei, toWeiPerSec, toDAI, formatSplits } from 'drips-sdk'
  import { ethers as Ethers, BigNumber as bn } from 'ethers'
  import Web3Modal from 'web3modal'
  // TODO: https://github.com/WalletConnect/walletconnect-monorepo/issues/341
  import WalletConnectProvider from '@walletconnect/web3-provider/dist/umd/index.min.js'
import { getAddress } from 'ethers/lib/utils';

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

  let dripsClient;
  let responseText;

  function getNetworkName ( networkId ) {
    return networks[networkId].name
  }

  async function connect () {
    try {
      const walletProvider = await web3Modal.connect()
      const provider = new Ethers.providers.Web3Provider(walletProvider)

      dripsClient = new DripsClient(provider);
      await dripsClient.connect()

      displayAddressNetworkAndApproval()
      displayUserDrips()
      displayUserSplits()

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

    displayAddressNetworkAndApproval()
    displayUserDrips()
    displayUserSplits()
  }

  async function approveDAIContract () {
    try {
      if (!dripsClient) {
        responseText.textContent = `Wallet must be connected before approving.`
        throw 'Wallet not connected'
      }

      let transaction = await dripsClient.approveDAIContract()

      // Wait for the transaction to confirm
      responseText.textContent = 'Waiting for the transaction to be confirmed'
      let txReceipt = await transaction.wait()
      responseText.textContent = `Address has been approved in DAI contract!`
    } catch (e) {
      console.error(e)
    }
  }

  async function updateDripsWithInputs () {
    try {

      let topUpDai = (document.getElementById("topUpDai")).value
      const topUpWei = toWei(Number(topUpDai))

      if (!dripsClient || !dripsClient.address) throw 'Please connect the wallet first'

      // check how much DAI is in wallet, if topping-up
      if (topUpWei.gt(0)) {
        const allowance = await dripsClient.getAllowance()

        console.log('allowance for address ' + dripsClient.getAddress() + ' --> ' + allowance)

        // display an error if the user doesn't have enough DAI
        if (allowance.lt(topUpWei)) {
          responseText.value = 'You do not have enough DAI, or must first approve DAI for your addres.'
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
      let dripToAddressInput = (document.getElementById("dripToAddress1")).value
      let dripToDAIInput = (document.getElementById("dripToDAI1")).value

      let newReceivers = []
      if (dripToAddressInput !== "" && dripToDAIInput !== "") {
        const dripToAddress = dripsClient.validateAddressInput(dripToAddressInput)
        const amtWeiPerSec = toWeiPerSec(parseInt(dripToDAIInput))
        newReceivers.push([dripToAddress, amtWeiPerSec])
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
      responseText.textContent = 'Confirm the transaction in your wallet.'
      let txReceipt
      let transaction = await dripsClient.updateUserDrips (
        userDripsJson.timestamp,
        userDripsJson.balance,
        userDripsJson.receivers,
        topUpWei,
        newReceivers )

      responseText.textContent = 'Waiting for the transaction to confirm...'
      txReceipt = await transaction.wait()

      // Confirmed!
      responseText.textContent = 'Confirmed!'

      // Refresh drips config JSON
      const div = document.getElementById('userDripsJSON');
      div.textContent = 'Drips JSON will take a few moments to be updated in the subgraph. Wait a few moments and then disconnect and then reconnect to see the updated JSON.';

    } catch (e) {
      console.log(e)
      console.log(e.stack)
      responseText.textContent = e.data?.message || e.message || e
    }
  }

  async function updateSplitsWithInputs () {
    try {
      if (!dripsClient || !dripsClient.address) throw 'Please connect the wallet first'

      // resolve receiver inputs
      let newReceivers = []
      let splitToAddressInput = (document.getElementById("splitToAddress1")).value
      let splitToPercentInput = (document.getElementById("splitToPercent1")).value

      if (splitToAddressInput !== "" && splitToPercentInput !== "") {
        const dripToAddress = dripsClient.validateAddressInput(splitToAddressInput)
        
        newReceivers.push({dripToAddress, percent: splitToPercentInput})
      }

      // format newReceivers param
      newReceivers = formatSplits(newReceivers)

      // params
      const currentReceivers = getSplitsBySender(dripsClient.address)
      
      responseText.textContent = 'Confirm the transaction in your wallet.'
      let tx = await dripsClient.updateAddressSplit(currentReceivers, newReceivers)
      console.log('update splits tx', tx.value)

      // wait for tx...
      txMsg.value = { message: 'Waiting for transaction confirmation...' }
      txReceipt.value = await tx.value.wait()

      // success
      emit('updated')
      txMsg.value = { status: 1, message: 'Confirmed! View your drips on your profile!' }
    } catch (e) {
      console.log(e)
      console.log(e.stack)
      responseText.textContent = e.data?.message || e.message || e
    }
  }

  async function displayAddressNetworkAndApproval () {
    console.log('in displayAddressAndNetwork')
    if (dripsClient) {
      const addressDiv = document.getElementById('address')
      let address = dripsClient.address;
      if (address) {
        addressDiv.textContent = 'Address: ' + address
      } else {
        addressDiv.textContent = 'Address: [Not Connected]'
      }

      const networkDiv = document.getElementById('network')
      let network = dripsClient.networkId;
      if (network) {
        networkDiv.textContent = 'Network: ' + getNetworkName(network)
      } else {
        networkDiv.textContent = 'Network: [Not Connected]'
      }

      const approvedDiv = document.getElementById('daiApproved')
      let daiApproved = null
      if (dripsClient && dripsClient.address) {
        daiApproved = toDAI(await dripsClient.getAllowance(dripsClient.getHubContract().address), 'pretty', 2)
      }
      if (daiApproved) {
        approvedDiv.textContent = 'DAI Approved: ' + daiApproved
      } else {
        approvedDiv.textContent = 'DAI Approved: None Approved'
      }
    }
  }

  async function displayUserDrips () {
    const div = document.getElementById('userDripsJSON');
    if (dripsClient && dripsClient.address) {
      console.log(dripsClient.getAddress())
      let userDripsJson = await getDripsBySender(dripsClient.getAddress().toLowerCase())
      console.log(userDripsJson)
      div.textContent = 'Drips JSON: ' + JSON.stringify(userDripsJson);
    } else {
      div.textContent = ""
    }
  }

  async function displayUserSplits () {
    const div = document.getElementById('userSplitsJSON');
    if (dripsClient && dripsClient.address) {
      console.log(dripsClient.getAddress())
      let userDripsJson = await getSplitsBySender(dripsClient.getAddress().toLowerCase())
      console.log(userDripsJson)
      div.textContent = 'Splits JSON: ' + JSON.stringify(userDripsJson);
    } else {
      div.textContent = ""
    }
  }

  async function displayQueryBySenderDrips () {
    displayDripsQueryResult("queryAddress",'queryAddressDripsJSON',getDripsBySender)
  }

  async function displayQueryByReceiverDrips () {
    displayDripsQueryResult("queryAddress",'queryAddressDripsJSON',getDripsByReceiver)
  }

  async function displayDripsQueryResult (inputField, outputDivId, subgraphClientFunction) {
    let queryAddressInput = (document.getElementById(inputField)).value

    const div = document.getElementById(outputDivId);
    if (queryAddressInput && queryAddressInput !== "") {
      let userDripsJson = await subgraphClientFunction(queryAddressInput.toLowerCase())
      div.textContent = JSON.stringify(userDripsJson);
    } else {
      div.textContent = ""
    }
  }

  onMount(() => {
    document.querySelector("#connect").addEventListener('click', connect);
    document.querySelector("#disconnect").addEventListener('click', disconnect);
    document.querySelector("#approveDAIContract").addEventListener('click', approveDAIContract);
    document.querySelector("#updateUserDrips").addEventListener('click', updateDripsWithInputs);
    document.querySelector("#queryBySender").addEventListener('click', displayQueryBySenderDrips);
    document.querySelector("#queryByReceiver").addEventListener('click', displayQueryByReceiverDrips);
    responseText = document.getElementById("responseText");
  })

</script>

<main>

  <div class="row">
    <div class="column">
      <h1>DripsClient Example</h1>
      <div id="responseText" style="color: red; padding-bottom: 20px;"></div>
      <button id="connect">Connect</button>
      <button id= "disconnect">Disconnect</button>
      <button id= "approveDAIContract">Approve DAI</button>
      <p> </p>
      <h2>Wallet/Network Details</h2>
      <div id="address">Address: [Not Connected]</div>
      <div id="network">Network: [Not Connected]</div>
      <div id="daiApproved">DAI Approved: [None Approved]</div>
      <p> </p>
      <h2>New Drips Config Input</h2>
      <div>Top-Up/Withdrawal: <input type="text" id="topUpDai" value="0"></div>
      <div><p></p><h3>Drips Entries (address / DAI amount):</h3></div>
      
      <div>1. <input size="46" type="text" id="dripToAddress1"/><input type="text" id="dripToDAI1"/></div>
      <div>2. <input size="46" type="text" id="dripToAddress2"/><input type="text" id="dripToDAI2"/></div>
      <div>3. <input size="46" type="text" id="dripToAddress3"/><input type="text" id="dripToDAI3"/></div>
      <button id= "updateUserDrips">Update Drips</button>

      <h2>User's Current Drips/Splits JSON Records</h2>
      <div id="userDripsJSON"></div><p></p>
      <div id="userSplitsJSON"></div>
    </div>
    <div class="column">
      <h1>Subgraph Query Example</h1>
      <div id="responseTextSubgraph" style="color: red; padding-bottom: 20px;"></div>
      <div><button id="queryBySender">Query By Sender</button> <button id="queryByReceiver">Query By Receiver</button></div>
      <p></p>
      <div>Address: <input size="46" type="text" id="queryAddress"/></div>


      <p> </p>

      <h2>Drips JSON Records</h2>
      <div id="queryResponseEntityType"></div>
      <div id="queryAddressDripsJSON">[Enter search address above]</div>
      <div id="queryAddressSplitsJSON"></div>
    </div>
  </div>


</main>

<style>
    * {
      box-sizing: border-box;
    }

    /* Create two equal columns that floats next to each other */
    .column {
      float: left;
      width: 50%;
      padding: 10px;
      height: 300px; /* Should be removed. Only for demonstration */
    }

    /* Clear floats after the columns */
    .row:after {
      content: "";
      display: table;
      clear: both;
    }
</style>