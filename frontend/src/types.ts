export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
export type FindingStatus = 'pending' | 'verifying' | 'verified' | 'failed';
export type Verdict = 'VALID' | 'INVALID' | 'NEEDS_FURTHER_REVIEW';
export type BlockchainStatus = 'recording' | 'recorded' | 'failed';

export interface Finding {
  id: string;
  title: string;
  researcher_name: string;
  researcher_email: string;
  submitter_eth_address?: string;
  severity?: Severity;
  content: string;
  content_hash?: string;
  pdf_filename?: string;
  status: FindingStatus;
  spec_analysis?: string;
  spec_verdict?: Verdict;
  sdk_analysis?: string;
  sdk_verdict?: Verdict;
  overall_verdict?: Verdict;
  error_message?: string;
  // Blockchain record
  blockchain_status?: BlockchainStatus;
  tx_hash?: string;
  block_number?: number;
  block_hash?: string;
  from_address?: string;
  to_address?: string;
  chain_name?: string;
  explorer_url?: string;
  blockchain_error?: string;
  // Timestamps
  created_at: string;
  verified_at?: string;
  recorded_at?: string;
}
