import { musicDnaService, DynamicHomeSections } from '../../../services/musicDnaService';
import { useNetworkStore } from '../../../services/networkService';
import { Track } from '../../../store/useAudioStore';
import { imagePreloadEngine } from './imagePreload.engine';
import { deduplicateArtists } from './artistDedupe.helper';

export interface TimeContextInfo {
  greeting: string;
  subtitle: string;
}

export class MusicDataEngine {
  public static getTimeContext(): TimeContextInfo {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return { greeting: 'Good morning', subtitle: 'Morning Cadence & Energy' };
    }
    if (hour >= 12 && hour < 18) {
      return { greeting: 'Good afternoon', subtitle: 'Peak Workout & Rhythm' };
    }
    if (hour >= 18 && hour < 23) {
      return { greeting: 'Good evening', subtitle: 'Sunset Beats & Recovery' };
    }
    return { greeting: 'Late night', subtitle: 'Night Focus & Cool Down' };
  }

  public static getSectionsSync(filter: string = 'All', history: Track[] = []): DynamicHomeSections {
    const sections = musicDnaService.getSectionsSync(filter, history);
    if (sections?.favouriteArtists) {
      sections.favouriteArtists = deduplicateArtists(sections.favouriteArtists);
    }
    return sections;
  }

  public static async fetchEnrichedSections(
    filter: string,
    history: Track[],
    likedTrackIds: string[]
  ): Promise<DynamicHomeSections> {
    const sections = await musicDnaService.getDynamicHomeSections(filter, history, likedTrackIds);
    if (sections?.favouriteArtists) {
      sections.favouriteArtists = deduplicateArtists(sections.favouriteArtists);
    }
    // Schedule deferred image preloading for smooth viewing
    this.scheduleArtworkPreload(sections);
    return sections;
  }

  public static async refreshFeeds(filter: string): Promise<DynamicHomeSections> {
    const sections = await musicDnaService.refreshLiveFeeds(filter);
    if (sections?.favouriteArtists) {
      sections.favouriteArtists = deduplicateArtists(sections.favouriteArtists);
    }
    this.scheduleArtworkPreload(sections);
    return sections;
  }

  /**
   * Collects all artwork URLs and schedules background prefetching
   * without blocking UI frames.
   */
  public static scheduleArtworkPreload(sections: DynamicHomeSections) {
    if (!useNetworkStore.getState().isOnline) return;
    const urls: (string | null | undefined)[] = [];

    // Quick jump thumbnails
    sections.quickJump.forEach((t) => urls.push(t.thumbnail));

    // Picked for you
    if (sections.pickedForYou?.thumbnail) {
      urls.push(sections.pickedForYou.thumbnail);
    }

    // Top mixes
    sections.topMixes.forEach((m) => {
      urls.push(m.artwork);
      m.tracks.slice(0, 2).forEach((t) => urls.push(t.thumbnail));
    });

    // Workout cadence
    sections.energyWorkout.slice(0, 6).forEach((t) => urls.push(t.thumbnail));

    // Schedule prefetch safely
    imagePreloadEngine.scheduleDeferredPrefetch(urls, 1500);
  }
}
