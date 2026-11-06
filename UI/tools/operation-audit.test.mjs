import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { operationRecorder } from './operation-audit.mjs';
const spec = { paths: { '/api/tasks/{id}': { get: {}, put: {}, parameters: [] }, '/api/tasks/roots': { get: {} }, '/api/tasks/{id}/time': { get: {} } } };
function send(record, url, method = 'GET', status = 200, headers = { 'sec-fetch-site': 'same-origin', 'sec-fetch-dest': 'empty' }) { const response = Object.assign(new EventEmitter(), { statusCode: status }); record({ url, method, headers }, response); response.emit('finish'); }
test('known templates only: no raw id, query, token or header can enter the audit', () => {
  let log = ''; const record = operationRecorder(spec, line => { log += line; });
  send(record, '/api/tasks/synthetic-private-id/time?access_token=synthetic-private-token');
  assert.deepEqual(JSON.parse(log), { method: 'GET', path: '/api/tasks/{id}/time', status: 200 }); assert.equal(log.includes('synthetic-private'), false);
});
test('literal routes win over placeholders; unique status evidence is retained without duplicate rows', () => {
  const rows = [], record = operationRecorder(spec, line => rows.push(JSON.parse(line)));
  send(record, '/api/tasks/roots'); send(record, '/api/tasks/roots'); send(record, '/api/tasks/roots', 'GET', 401);
  assert.deepEqual(rows, [{ method: 'GET', path: '/api/tasks/roots', status: 200 }, { method: 'GET', path: '/api/tasks/roots', status: 401 }]);
});
test('unknown routes and verbs never turn into raw-path evidence', () => {
  const rows = [], record = operationRecorder(spec, line => rows.push(line));
  send(record, '/api/unknown/private'); send(record, '/api/tasks/secret', 'DELETE'); send(record, '/api/hubs/planner?access_token=private'); send(record, '/api/tasks/fixture', 'GET', 200, {}); assert.deepEqual(rows, []);
});
