import { CloudTriggerParams } from '@borda/server';

export function beforeSignUp({ doc }: CloudTriggerParams) {
  // alter the doc before signing up
  return {
    doc: {
      description: 'yolo ' + doc['name'],
    },
  };
}
