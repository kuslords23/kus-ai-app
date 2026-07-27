-- Fix missing columns so bootstrap-knowledge can save MoMo packets.
-- Run in Supabase SQL Editor (Kus-lords-prod), then reopen bootstrap link.

alter table knowledge_chunks
  add column if not exists department_id text;

alter table golden_qa_pairs
  add column if not exists department_id text;

-- Optional: insert MoMo immediately (works even before bootstrap link)
insert into knowledge_chunks (
  content, content_hash, domain, department_id,
  verification_status, confidence, token_count, source_url
) values (
  E'# MoMo (Mobile Money) in Ghana\n\nMoMo is Ghana''s mobile money system — digital cash tied to a phone number.\n\n## What it is\n- Store money on your mobile wallet\n- Send/receive to other wallets and bank accounts\n- Pay merchants, utilities, and airtime\n- Cash in (deposit) and cash out (withdraw) through agents\n\n## Main providers\n- MTN MoMo\n- Telecel Cash (formerly Vodafone Cash)\n- AT Money\n\n## Safety\nNever share your PIN or OTP. Confirm recipient name before sending.',
  md5('momo-ghana-starter-v1'),
  'finance',
  'finance',
  'verified',
  0.95,
  200,
  'kingdom-starter://finance/momo'
)
on conflict (content_hash) do nothing;

insert into golden_qa_pairs (
  question, answer, domain, department_id,
  style_tags, verification_status, confidence
) values (
  'Explain MoMo in Ghana',
  'MoMo (Mobile Money) in Ghana is electronic money stored on your phone number. You send, receive, pay bills, and buy airtime without a bank account. Major providers include MTN MoMo, Telecel Cash (formerly Vodafone Cash), and AT Money. Protect your PIN and confirm the recipient name before sending.',
  'finance',
  'finance',
  array['starter','verified'],
  'verified',
  0.95
);
