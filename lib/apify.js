const API = 'https://api.apify.com/v2';
const FINISHED = ['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'];
const TIMEOUT_MINUTES = 30;
const POLL_SECONDS = 20; // short long-polls, because some networks drop idle connections sooner than 60 s

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function client(token) {
  return async (path, init = {}) => {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Apify ${init.method ?? 'GET'} ${path} failed with ${response.status}: ${await response.text()}`);
    }
    return response.json();
  };
}

/** Retries a read when the connection drops. fetch() reports network failures as TypeErrors. */
async function retrying(read) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await read();
    } catch (error) {
      if (!(error instanceof TypeError) || attempt === 5) throw error;
      await sleep(5_000);
    }
  }
}

/** Starts an Actor run and returns its dataset items once it finishes. */
export async function runActor(actor, input, { token, maxChargeUsd }) {
  const { data: run } = await client(token)(`/acts/${actor.replace('/', '~')}/runs?maxTotalChargeUsd=${maxChargeUsd}`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return finishRun(run.id, { token });
}

/** Waits for a run, started now or earlier, to finish and returns its dataset items. */
export async function finishRun(runId, { token }) {
  const api = client(token);
  const deadline = Date.now() + TIMEOUT_MINUTES * 60_000;
  let run = { status: 'READY' };

  while (!FINISHED.includes(run.status)) {
    if (Date.now() > deadline) throw new Error(`Apify run ${runId} is still ${run.status} after ${TIMEOUT_MINUTES} minutes`);
    ({ data: run } = await retrying(() => api(`/actor-runs/${runId}?waitForFinish=${POLL_SECONDS}`)));
  }
  if (run.status !== 'SUCCEEDED') throw new Error(`Apify run ${runId} ended with status ${run.status}`);

  return retrying(() => api(`/datasets/${run.defaultDatasetId}/items?clean=true&format=json`));
}
