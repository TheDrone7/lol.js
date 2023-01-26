import type { BaseManager, FetchOptions, MatchByPlayerOptions, MatchData, MatchTimelineData } from '../types';
import { Match, type Summoner, MatchTimeline } from '../structures';
import type { Client } from '../client';
import { parseFetchOptions } from '../util';

/**
 * A match manager - to fetch and manage matches.
 */
export class MatchManager implements BaseManager<Match> {
  /**
   * The client that instantiated the manager.
   */
  readonly client: Client;

  /**
   * Creates a new match manager.
   * @param client - The client that instantiated the manager.
   */
  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Fetch a match by its ID.
   * @param id - The ID of the match
   * @param options - The basic fetch options
   */
  async fetch(id: string, options?: FetchOptions) {
    const opts = parseFetchOptions(this.client, 'match', options);
    const { ignoreCache, cache, store, ignoreStorage, region } = opts;
    this.client.logger?.trace(`Fetching match for ID: ${id} with options: `, opts);
    return new Promise<Match>(async (resolve, reject) => {
      const exists = await this.client.cache.has(`match:${id}`);
      if (exists && !ignoreCache) resolve(await this.client.cache.get(id)!);
      else {
        const items = await this.client.items.fetchAll();
        const spells = await this.client.summonerSpells.fetchAll();
        const runeTrees = await this.client.runes.fetchAll();
        const storage = this.client.storage.fetch<MatchData>('match', id);
        const stored = storage instanceof Promise ? await storage.catch(() => undefined) : storage;
        if (stored && !ignoreStorage) {
          const participantChamps = await this.client.champions.fetchByKeys(
            stored.info.participants.map((p) => p.championId)
          );
          const bannedChamps = await this.client.champions.fetchByKeys(
            stored.info.teams.map((t) => t.bans).flatMap((b) => b.map((b) => b.championId))
          );
          const result = new Match(
            this.client,
            stored,
            bannedChamps.concat(participantChamps),
            items,
            runeTrees,
            spells
          );
          if (cache) await this.client.cache.set(`match:${id}`, result);
          resolve(result);
        } else {
          const response = await this.client.api
            .makeApiRequest(`/lol/match/v5/matches/${id}`, {
              region: region!,
              regional: true,
              name: 'Get Match By Match ID',
              params: 'Match ID: ' + id
            })
            .catch(reject);
          if (response)
            try {
              const data = <MatchData>response.data;
              const participantChamps = await this.client.champions.fetchByKeys(
                data.info.participants.map((p) => p.championId)
              );
              const bannedChamps = await this.client.champions.fetchByKeys(
                data.info.teams.map((t) => t.bans).flatMap((b) => b.map((b) => b.championId))
              );

              const match = new Match(
                this.client,
                data,
                bannedChamps.concat(participantChamps),
                items,
                runeTrees,
                spells
              );
              if (cache) await this.client.cache.set(`match:${id}`, match);
              if (store) await this.client.storage.save(data, `match`, id);
              resolve(match);
            } catch (e: any) {
              reject(e);
            }
          else reject(new Error('No match found'));
        }
      }
    });
  }

  /**
   * Fetch a match timeline by the match ID.
   *
   * @param matchId - The ID of the match
   * @param options - The basic fetch options
   */
  async fetchMatchTimeline(matchId: string, options?: FetchOptions) {
    const opts = parseFetchOptions(this.client, 'match', options);
    const { ignoreCache, ignoreStorage, store, cache, region } = opts;
    this.client.logger?.trace(`Fetching match timeline for ID: ${matchId} with options: `, opts);
    return new Promise<MatchTimeline>(async (resolve, reject) => {
      const exists = await this.client.cache.has(`match-timeline:${matchId}`);
      if (exists && !ignoreCache) resolve(await this.client.cache.get(`match-timeline:${matchId}`)!);
      else {
        const items = await this.client.items.fetchAll(options);
        const storage = this.client.storage.fetch<MatchTimelineData>('match-timeline', matchId);
        const stored = storage instanceof Promise ? await storage.catch(() => undefined) : storage;
        if (stored && !ignoreStorage) {
          const timeline = new MatchTimeline(stored, items);
          if (cache) await this.client.cache.set(matchId, timeline);
          resolve(timeline);
        } else {
          const response = await this.client.api
            .makeApiRequest(`/lol/match/v5/matches/${matchId}/timeline`, {
              region: region!,
              regional: true,
              name: 'Get Match Timeline By Match ID',
              params: 'Match ID: ' + matchId
            })
            .catch(reject);
          if (response) {
            const data = <MatchTimelineData>response.data;
            const timeline = new MatchTimeline(data, items);
            if (cache) await this.client.cache.set(matchId, timeline);
            if (store) await this.client.storage.save(data, 'match-timeline', matchId);
            resolve(timeline);
          } else reject(new Error('No match timeline found for the given ID.'));
        }
      }
    });
  }

  /**
   * Fetch a list of match IDs by a player ID.
   * These are neither stored nor cached.
   *
   * @param player - The summoner or their player ID whose matches need to be fetched.
   * @param options - The options for filtering the matches.
   */
  async fetchMatchListByPlayer(player: Summoner | string, options?: MatchByPlayerOptions) {
    const playerId = typeof player === 'string' ? player : player.playerId;
    const region = typeof player === 'string' ? this.client.region : player.region;
    this.client.logger?.trace(`Fetching match list for player ID: ${playerId} with options: `, options);
    return new Promise<string[]>(async (resolve, reject) => {
      // The base is not used here, it is only there to prevent INVALID URL errors.
      const url = new URL('/lol/match/v5/matches/by-puuid/' + playerId + '/ids', 'https://na1.api.riotgames.com');
      if (options?.startTime) url.searchParams.set('startTime', options.startTime.toString());
      if (options?.endTime) url.searchParams.set('endTime', options.endTime.toString());
      if (options?.queue) url.searchParams.set('queue', options.queue.toString());
      if (options?.type) url.searchParams.set('type', options.type);
      if (options?.start) url.searchParams.set('start', options.start.toString());
      if (options?.count) url.searchParams.set('count', options.count.toString());
      const response = await this.client.api
        .makeApiRequest(url.pathname + url.search, {
          region,
          regional: true,
          name: 'Get Match List By Player ID',
          params: 'Player ID: ' + playerId
        })
        .catch(reject);
      if (response) {
        const data = <string[]>response.data;
        resolve(data);
      }
    });
  }
}
