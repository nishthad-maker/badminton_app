-- One-off cleanup: remove throwaway accounts created while screenshotting
-- the Home screen redesign (emails look like design-preview-<timestamp>@example.com).
delete from public.profiles where id in (
  select id from auth.users where email like 'design-preview-%@example.com'
);
delete from auth.users where email like 'design-preview-%@example.com';
