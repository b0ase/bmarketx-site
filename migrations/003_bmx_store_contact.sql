-- bMarketX: where buyers can write to a store's owner in bWalletX (bMail): a $handle or a paymail.
alter table bmx_stores add column if not exists contact text check (contact is null or length(contact) <= 100);
