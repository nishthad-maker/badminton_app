-- Second cleanup pass: another throwaway design-preview account was created
-- while re-screenshotting the Home redesign after the font-size fix.
delete from public.profiles where id in (
  select id from auth.users where email like 'design-preview-%@example.com'
);
delete from auth.users where email like 'design-preview-%@example.com';
