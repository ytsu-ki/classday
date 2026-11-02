import { problemOf, type Problem } from '../domain/problems';
import { parseIcs, type IcsOptions } from './ics';

/** Calendar parsing runs off the main thread so a large file cannot freeze the app. */
self.onmessage = (message: MessageEvent<{ text: string; options: IcsOptions }>) => {
  try {
    self.postMessage({ events: parseIcs(message.data.text, message.data.options) });
  } catch (error) {
    const problem: Problem = problemOf(error) ?? { code: 'ics-unreadable' };
    self.postMessage({ problem });
  }
};
