// Corre la suite completa del esquema contra un MySQL 8 efimero.
//   node db/tests/run.mjs
import { setup, teardown, runAll } from './harness.mjs';

console.log('Arrancando MySQL efimero y cargando db/schema.sql...');
await setup();
await import('./fixes-01-05.mjs');
await import('./fixes-06-13.mjs');
await import('./fixes-14-16.mjs');
await import('./fixes-17-18.mjs');
await import('./fixes-19-22.mjs');

const fallos = await runAll();
await teardown();
process.exit(fallos > 0 ? 1 : 0);
