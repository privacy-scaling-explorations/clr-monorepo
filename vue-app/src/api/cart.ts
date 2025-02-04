import { type CartItem, getContributorMessages } from './contributions'
import type { RoundInfo } from './round'
import { Keypair, Command } from '@clrfund/maci-utils'
import { BigNumber } from 'ethers'
import { getProjectByIndex } from './projects'
import { formatAmount } from '@/utils/amounts'
import { maxDecimals } from './core'

/**
 * Get the committed cart items from the subgraph for the user with the encryption key
 *
 * @param round current round information
 * @param encryptionKey encryption key to decrypt the message
 * @returns committed cart items
 */
export async function getCommittedCart(
  round: RoundInfo,
  encryptionKey: string,
  contributorAddress: string,
): Promise<CartItem[]> {
  const { coordinatorPubKey, fundingRoundAddress, voiceCreditFactor, nativeTokenDecimals, recipientRegistryAddress } =
    round

  const encKeypair = await Keypair.createFromSeed(encryptionKey)

  const sharedKey = Keypair.genEcdhSharedKey(encKeypair.privKey, coordinatorPubKey)

  const messages = await getContributorMessages({
    fundingRoundAddress,
    contributorKey: encKeypair,
    coordinatorPubKey,
    contributorAddress,
  })

  const cartItems = messages.map(async message => {
    const { command } = Command.decrypt(message, sharedKey)
    const { voteOptionIndex, newVoteWeight } = command

    const voteWeightString = newVoteWeight.toString()
    const amount = BigNumber.from(voteWeightString).mul(voteWeightString).mul(voiceCreditFactor)

    const project = await getProjectByIndex(recipientRegistryAddress, Number(voteOptionIndex))

    if (!project) {
      return null
    }

    // after the initial submission, the number of messages submitted to MACI
    // cannot be reduced, isCleared is used to mark deleted items
    return {
      amount: formatAmount(amount, nativeTokenDecimals, null, maxDecimals),
      isCleared: amount.isZero(),
      ...project,
    }
  })

  const committedCart = await Promise.all(cartItems)
  return committedCart.filter(Boolean) as CartItem[]
}
