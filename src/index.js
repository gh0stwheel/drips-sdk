import { ethers as Ethers, BigNumber as bn } from 'ethers'

export class DripsClient {
  constructor(provider) {
    this.provider = provider
    let signer, walletProvider, address, networkId
  }

  getRadicleRegistryContract () {
    return new Ethers.Contract(RadicleRegistry.address, RadicleRegistry.abi, provider)
  }

  getProjectContract (address) {
    return new Ethers.Contract(address, DripsToken.abi, provider)
  }

  getDAIContract () {
    return new Ethers.Contract(DAI.address, DAI.abi, provider)
  }

  getHubContract () {
    return new Ethers.Contract(DaiDripsHub.address, DaiDripsHub.abi, provider)
  }

  async connect () {
    try {
      // connect and update signer
      signer = provider.getSigner()

      // set user address
      let signerAddress = await signer.getAddress()
      signIn(signerAddress)

      // set network id
      await setNetworkId()

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

  // Disconnect the wallet
  disconnect () {
    // clear so they can re-select from scratch
    web3Modal.clearCachedProvider()
    // manually clear walletconnect --- https://github.com/Web3Modal/web3modal/issues/354
    localStorage.removeItem('walletconnect')

    signOut()
    setupFallbackProvider()
    signer = null

    console.log('disconnected from wallet')
  }

  listenToWalletProvider () {
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

  async setNetworkId() {
    networkId = (await provider.getNetwork()).chainId
  }

  signIn(signInAddress) {
    address = signInAddress.toLowerCase()
  }

  signOut () {
    address = null
  }

  async setupFallbackProvider () {
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

  async updateUserDrips (lastUpdate, lastBalance, currentReceivers, balanceDelta, newReceivers ) {
    try {
      if (!signer) throw "Not connected to wallet"

      const contract = getHubContract()
      const contractSigner = contract.connect(signer)

      // Send the tx to the contract
      return contractSigner['setDrips(uint64,uint128,(address,uint128)[],int128,(address,uint128)[])'](lastUpdate, lastBalance, currentReceivers, balanceDelta, newReceivers)
    } catch (e) {
      console.error(e)
      throw e
    }
  }
}

