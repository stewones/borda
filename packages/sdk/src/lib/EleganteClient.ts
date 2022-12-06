import { EleganteClientParams } from './createClient';

export interface EleganteClientProtocol {
  params: EleganteClientParams;
}

export const EleganteClient: EleganteClientProtocol = {
  params: {} as EleganteClientParams,
};
