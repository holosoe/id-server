export type PhoneSession = {
  chainId: string
  id: string
  numAttempts: string
  sessionStatus: string
  txHash: string
}
export type PhoneSessions = Array<PhoneSession>
