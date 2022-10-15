import type { BaseManager, ChallengeConfigData, FetchOptions } from '../types';
import { Challenge } from '../structures/Challenge';
import { Collection } from '@discordjs/collection';
import type { Client } from '../client';

export class ChallengeManager implements BaseManager<Challenge> {
  /**
   * The client this manager belongs to.
   */
  readonly client: Client;
  /**
   * The challenge info (mapped by challenge ID) stored in the memory.
   */
  readonly cache: Collection<number, Challenge>;

  constructor(client: Client) {
    this.client = client;
    this.cache = new Collection<number, Challenge>();
  }

  async fetch(id: number, options?: FetchOptions) {
    const force = options?.force ?? false;
    const cache = options?.cache ?? true;
    const region = options?.region ?? this.client.region;
    return new Promise<Challenge>(async (resolve, reject) => {
      if (!force && this.cache.has(id)) resolve(this.cache.get(id)!);
      else {
        const cResponse = await this.client.api.makeApiRequest(`/lol/challenges/v1/challenges/${id}/config`, {
          region,
          regional: false,
          name: 'Challenge config by ID',
          params: `Challenge ID: ${id}`
        });
        const pResponse = await this.client.api.makeApiRequest(`/lol/challenges/v1/challenges/${id}/percentiles`, {
          region,
          regional: false,
          name: 'Challenge percentiles by ID',
          params: `Challenge ID: ${id}`
        });
        if (cResponse.status !== 200) reject(cResponse);
        else if (pResponse.status !== 200) reject(pResponse);
        else {
          const data = <ChallengeConfigData>cResponse.data;
          const challenge = new Challenge(this.client, data);
          if (cache) this.cache.set(id, challenge);
          resolve(challenge);
        }
      }
    });
  }
}
