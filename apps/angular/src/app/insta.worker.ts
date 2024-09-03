/// <reference lib="webworker" />

import { insta } from './borda';

addEventListener('message', insta.worker());
