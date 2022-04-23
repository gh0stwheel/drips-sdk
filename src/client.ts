import { ethers as Ethers, utils } from 'ethers'
import { RadicleRegistry, DAI, DripsToken, DaiDripsHub } from './contracts';

export class DripsClient {
  provider: any;
  signer: any;
  walletProvider: any;
  address: any;
  networkId: any;


  constructor(provider) {
    this.provider = provider
    this.signer = undefined
    this.walletProvider = undefined
    this.address = undefined
    this.networkId = undefined
  }

  getAddress () {
    return this.address
  }

  getNetworkId () {
    return this.networkId
  }

  getRadicleRegistryContract () {
    return new Ethers.Contract(RadicleRegistry.address, RadicleRegistry.abi, this.provider)
  }

  getProjectContract (address) {
    return new Ethers.Contract(this.address, DripsToken.abi, this.provider)
  }

  getDAIContract () {
    return new Ethers.Contract(DAI.address, DAI.abi, this.provider)
  }

  getHubContract () {
    return new Ethers.Contract(DaiDripsHub.address, DaiDripsHub.abi, this.provider)
  }

  async connect () {
    try {
      // connect and update signer
      this.signer = this.provider.getSigner()

      // set user address
      let signerAddress = await this.signer.getAddress()
      this.signIn(signerAddress)

      // set network id
      await this.setNetworkId()

      this.listenToWalletProvider()

      console.log('connected to network ' + this.networkId + '!')

      // get all events
      console.log('---start---')
      let events = await this.getHubContract().queryFilter('DripsUpdated(address,uint128,(address,uint128)[])' as any)
      // filter by my address
      events = events.filter(event => event.args[0].toLowerCase() === "0x0630a42785B8A92205A492B3092279529990ED0C".toLowerCase())
      console.log('timestamp ' + (await events[0].getBlock()).timestamp)
      console.log(events)
      console.log('---end---')

      return true
    } catch (e) {

      console.error('@connect', e)

      // clear wallet in case
      this.disconnect()

      // throw error so stops any flows (closes modal too)
      throw e
    }
  }

  // Disconnect the wallet
  disconnect () {
    this.signOut()
    this.setupFallbackProvider()
    this.signer = null

    console.log('disconnected from wallet')
  }

  listenToWalletProvider () {
    if (!this.walletProvider?.on) return

    // account changed (or disconnected)
    this.walletProvider.on('accountsChanged', accounts => {
      console.log('accountsChanged', accounts)
      if (!accounts.length) {
        this.disconnect()
      }
      this.signIn(accounts[0])
    })

    // changed network
    this.walletProvider.on('chainChanged', chainId => {
      console.log('network changed', chainId)
      // reload page so data is correct...
      window.location.reload()
    })

    // random disconnection? (doesn't fire on account disconnect)
    this.walletProvider.on('disconnect', error => {
      console.error('disconnected?', error)
      this.disconnect()
    })
  }

  async setNetworkId() {
    this.networkId = (await this.provider.getNetwork()).chainId
  }

  signIn(signInAddress) {
    this.address = signInAddress.toLowerCase()
    console.log('setting address to ' + this.address)
  }

  signOut () {
    this.address = null
    this.networkId = null
    console.log('signOut() called')
  }

  async setupFallbackProvider () {
    try {
      if (window.ethereum) {
        // metamask/browser
        this.provider = new Ethers.providers.Web3Provider(window.ethereum)
      }
      // else {
      //   // infura fallback
      //   this.provider = Ethers.getDefaultProvider(deployNetwork.infura)
      // }

      return true
    } catch (e) {
      console.error(e)
    }

    return false;
  }

  async approveDAIContract () {
    try {
      if (!this.signer) throw 'DripsClient must be connected before approving DAI'

      const contract = new Ethers.Contract(DAI.address, DAI.abi, this.provider)
      const contractSigner = contract.connect(this.signer)

      // approve max amount
      const amount = Ethers.constants.MaxUint256
      const tx = await contractSigner.approve(DaiDripsHub.address, amount)
      return tx
    } catch (e) {
      console.error('@approveDAIContract', e)
      throw e
    }
  }

  async updateUserDrips (lastUpdate, lastBalance, currentReceivers, balanceDelta, newReceivers ) {
    try {
      if (!this.signer) throw "Not connected to wallet"

      const contract = this.getHubContract()
      const contractSigner = contract.connect(this.signer)

      // Send the tx to the contract
      console.log('lastUpdate: ' + lastUpdate)
      console.log('lastBalance: ' + lastBalance)
      console.log('currentReceivers: ' + currentReceivers)
      console.log('balanceDelta: ' + balanceDelta)
      console.log('newReceivers: ' + newReceivers)
      return contractSigner['setDrips(uint64,uint128,(address,uint128)[],int128,(address,uint128)[])'](lastUpdate, lastBalance, currentReceivers, balanceDelta, newReceivers)
    } catch (e) {
      console.error(e)
      throw e
    }
  }

  // Check how much DAI an address is allowed to spend on behalf of the signed-in user
  async getAllowance (spendingAddress) {
    if (!this.address) throw "Must call connect() before calling getAllowance()"

    const daiContract = this.getDAIContract()
    return daiContract.allowance(this.address, spendingAddress)
  }

  validateAddressInput = input => {
    return new Promise((resolve, reject) => {
      if (utils.isAddress(input)) {
        return resolve(input)
      }

      // !! not even ENS
      if (!input.endsWith('.eth')) {
        return reject(new Error(`"${input}" is neither an Ethereum address or ENS name (ends in .eth).`))
      }

      // check ENS...
      // this.resolveENS(input)
      //   .then(addr => {
      //     if (!addr) {
      //       reject(new Error(`"${input}" does not resolve to an Ethereum address`))
      //     }
      //     resolve(addr)
      //   })
      //   .catch(reject)
    })
  }

  async resolveENS ({ state, commit, dispatch }, ens) {
    // TODO -- get ENS resolution working again
    /*
    try {
      // saved ?
      let address = Object.keys(state.addresses).find(key => ens && state.addresses[key].ens === ens)
      if (address) return address
      // resolve...
      if (!provider) await dispatch('init')
      address = await provider.resolveName(ens)
      if (address) {
        // save if resolved...
        commit('SAVE_ADDRESS', { address, ens })
      }
      return address
    } catch (e) {
      console.error(e)
      return null
    }*/
  }
}
