import { useUi } from '../../app/context';
import { Button } from '../components/controls';
import { Icon } from '../components/Icon';
import { t } from '../../i18n';

/** First-run card: three ways to start, none required. */
export function WelcomeCard() {
  const ui = useUi();
  return (
    <section class="welcome" aria-labelledby="welcome-title">
      <p class="eyebrow">{t.welcome.eyebrow}</p>
      <h2 id="welcome-title">{t.welcome.title}</h2>
      <p>{t.welcome.body}</p>
      <div class="welcome-actions">
        <Button variant="primary" icon="school" onClick={() => ui.open({ type: 'import' })}>{t.welcome.importTimetable}</Button>
        <Button variant="soft" icon="plus" onClick={() => ui.open({ type: 'event', id: null })}>{t.welcome.addEvent}</Button>
        <Button variant="ghost" icon="check" onClick={() => { ui.go('plans'); ui.open({ type: 'capture' }); }}>{t.welcome.addTodo}</Button>
      </div>
      <p class="welcome-foot"><Icon name="shield" size={16} /> {t.welcome.foot}</p>
    </section>
  );
}
