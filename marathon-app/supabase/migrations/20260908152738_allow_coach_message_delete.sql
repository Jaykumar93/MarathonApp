-- coach_messages was originally immutable by design (no update/delete
-- policy at all - see the initial add_coach_rag migration's comment) since
-- a chat history read like something you'd never want to edit or lose. The
-- user has since asked for a way to delete a past conversation from
-- History, which overrides that default: own-rows-only delete, same
-- auth.uid() = user_id shape as every other per-user policy in this app.
create policy "coach_messages: delete own" on public.coach_messages
  for delete using (auth.uid() = user_id);

grant delete on public.coach_messages to authenticated;
