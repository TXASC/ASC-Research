-- NOT APPLIED. Calls the packet-alert function for each new packet request.
-- Before applying: deploy the function, set its secrets, and replace
-- <PROJECT_REF> and <HOOK_SECRET>. Store the secret in Vault rather than
-- in this file if you prefer: select vault.create_secret('<HOOK_SECRET>', 'packet_hook_secret');
create extension if not exists pg_net;

create or replace function public.notify_packet_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'request' then
    perform net.http_post(
      url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/packet-alert',
      headers := jsonb_build_object('Content-Type','application/json','x-hook-secret','<HOOK_SECRET>'),
      body    := jsonb_build_object('record', to_jsonb(new))
    );
  end if;
  return new;
end $$;

revoke all on function public.notify_packet_request() from public, anon, authenticated;

drop trigger if exists packet_request_alert on public.snapshot_requests;
create trigger packet_request_alert after insert on public.snapshot_requests
  for each row execute function public.notify_packet_request();
