import { Cloud } from '@elegante/server';

Cloud.beforeSignUp(({ doc, res }) => {
  // throw new EleganteError(601, 'test');
  return {
    doc: {
      name: 'yolo',
    },
  };
  return true;
});
