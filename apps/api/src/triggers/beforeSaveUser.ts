import { CloudTriggerParams } from '@borda/server';

export function beforeSaveUser({ doc }: CloudTriggerParams) {
  // alter the doc before saving
  return { doc: beforeSaveUserFormat(doc) };
}

export function beforeSaveUserFormat(user: any) {
  if (
    (user.name && !user.firstName && !user.lastName) ||
    (user.name && user.firstName && !user.lastName)
  ) {
    const nameSplit = user.name.split(' ');
    user.firstName = nameSplit[0];
    user.lastName = nameSplit[1] ? nameSplit[1] : '';
  }

  if (user.firstName) {
    user.firstName = user.firstName.trim();
  }

  if (user.lastName) {
    user.lastName = user.lastName.trim();
  }

  if (!user.name && (user.firstName || user.lastName)) {
    user.name = `${user.firstName || ''} ${user.lastName || ''}`;
  }

  if (user.email) {
    user.email = user.email.replace(/\n*$/, '').toLowerCase().trim();
  }
  return user;
}
