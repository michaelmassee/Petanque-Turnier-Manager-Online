import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { formatLocationAddress } from '../lib/domain.js';
import { Button, TextField, EditDialog, SelectField } from '../components/ui.jsx';
import { RichTextEditor } from '../components/RichTextEditor.jsx';
import { BoulePlaceFields } from '../components/BoulePlaceFields.jsx';
import { StandalonePageHeader } from '../components/layout.jsx';

const EMPTY_VENUE = { name: '', venueType: 'outdoor', address: '', latitude: null, longitude: null, locationConfirmed: false, courtCount: '', description: '', accessible: false, facilityCodes: [], facilities: '' };
const EMPTY_SOCIAL_LINKS = { facebook: '', instagram: '', x: '', youtube: '' };
const EMPTY_ORGANIZATION = { name: '', kind: 'club', description: '', websiteUrl: '', logoUrl: '', socialLinks: EMPTY_SOCIAL_LINKS, memberOf: [], contactName: '', contactEmail: '', contactPhone: '', venue: EMPTY_VENUE };
const venueLabel = (venue, t) => `${t(venue.venueType === 'indoor' ? 'Boulehalle' : 'Bouleplatz')}: ${venue.name}`;
const venueToForm = (venue) => ({ ...EMPTY_VENUE, ...venue, courtCount: String(venue.courtCount ?? ''), facilityCodes: venue.facilityCodes || [] });
const organizationToForm = (organization) => ({ ...EMPTY_ORGANIZATION, ...organization, socialLinks: { ...EMPTY_SOCIAL_LINKS, ...organization.socialLinks }, memberOf: organization.memberOf || [], venue: { ...EMPTY_VENUE } });

function OrganizationFields({ form, setForm, language, create }) {
  const { t } = useTranslation();
  const setSocialLink = (platform, value) => setForm({ ...form, socialLinks: { ...form.socialLinks, [platform]: value } });
  return <>
    <SelectField label={t('Organisationstyp')} value={form.kind} onChange={(kind) => setForm({ ...form, kind })} options={[{ value: 'club', label: t('Verein') }, { value: 'group', label: t('Gruppe') }]} />
    <TextField label={t('Name')} value={form.name} onChange={(name) => setForm({ ...form, name })} required minLength={2} />
    <RichTextEditor label={t('Beschreibung')} value={form.description} onChange={(description) => setForm({ ...form, description })} boldLabel={t('Fett')} italicLabel={t('Kursiv')} underlineLabel={t('Unterstrichen')} strikeLabel={t('Durchgestrichen')} bulletListLabel={t('Aufzählung')} orderedListLabel={t('Nummerierte Liste')} headingLabel={t('Überschrift')} />
    <TextField label={t('Website')} value={form.websiteUrl} onChange={(websiteUrl) => setForm({ ...form, websiteUrl })} />
    <TextField label={t('Logo-Bildlink')} type="url" value={form.logoUrl} onChange={(logoUrl) => setForm({ ...form, logoUrl })} />
    <TextField label={t('Facebook-Link')} type="url" placeholder="https://facebook.com/…" value={form.socialLinks.facebook} onChange={(value) => setSocialLink('facebook', value)} />
    <TextField label={t('Instagram-Link')} type="url" placeholder="https://instagram.com/…" value={form.socialLinks.instagram} onChange={(value) => setSocialLink('instagram', value)} />
    <TextField label={t('X-Link')} type="url" placeholder="https://x.com/…" value={form.socialLinks.x} onChange={(value) => setSocialLink('x', value)} />
    <TextField label={t('YouTube-Link')} type="url" placeholder="https://youtube.com/…" value={form.socialLinks.youtube} onChange={(value) => setSocialLink('youtube', value)} />
    <TextField label={t('Kontaktperson')} value={form.contactName} onChange={(contactName) => setForm({ ...form, contactName })} required minLength={2} />
    <TextField label={t('Kontakt-E-Mail')} type="email" value={form.contactEmail} onChange={(contactEmail) => setForm({ ...form, contactEmail })} required />
    <TextField label={t('Kontakt-Telefon')} value={form.contactPhone} onChange={(contactPhone) => setForm({ ...form, contactPhone })} />
    <div className="form-section">
      <div className="section-title">
        <h3>{t('Mitglied bei (Verbände)')}</h3>
        <Button type="button" variant="secondary" disabled={form.memberOf.length >= 10} onClick={() => setForm({ ...form, memberOf: [...form.memberOf, ''] })}>{t('Verband hinzufügen')}</Button>
      </div>
      <p className="hint">{t('Zum Beispiel Deutscher Sportverband, internationale oder andere nationale Verbände.')}</p>
      {form.memberOf.map((entry, index) => (
        <div className="form-grid" key={index}>
          <TextField label={`${t('Verband')} ${index + 1}`} value={entry} onChange={(value) => setForm({ ...form, memberOf: form.memberOf.map((item, itemIndex) => itemIndex === index ? value : item) })} maxLength={120} />
          <div className="tournament-question-remove">
            <Button type="button" variant="danger" onClick={() => setForm({ ...form, memberOf: form.memberOf.filter((_, itemIndex) => itemIndex !== index) })}>{t('Verband entfernen')}</Button>
          </div>
        </div>
      ))}
    </div>
    {create && <><h3>{t('Erster Spielort')}</h3><BoulePlaceFields form={form.venue} setForm={(venue) => setForm({ ...form, venue })} language={language} /></>}
  </>;
}

function MyOrganizationsPanel({ language, currentUser }) {
  const { t } = useTranslation();
  const [organizations, setOrganizations] = useState([]); const [venuesByOrganization, setVenuesByOrganization] = useState({}); const [myVenues, setMyVenues] = useState([]);
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [organizationDialog, setOrganizationDialog] = useState(false); const [editOrganization, setEditOrganization] = useState(null); const [organizationForm, setOrganizationForm] = useState(EMPTY_ORGANIZATION);
  const [venueDialog, setVenueDialog] = useState(false); const [venueOrganizationId, setVenueOrganizationId] = useState(null); const [editVenue, setEditVenue] = useState(null); const [venueForm, setVenueForm] = useState(EMPTY_VENUE);
  const [editorOrganization, setEditorOrganization] = useState(null); const [editors, setEditors] = useState([]); const [editorEmail, setEditorEmail] = useState('');
  const [deletingOrganizationId, setDeletingOrganizationId] = useState(null); const [deletingVenueId, setDeletingVenueId] = useState(null); const [removingEditorId, setRemovingEditorId] = useState(null);

  async function load() {
    setLoading(true); setError('');
    try {
      const [organizationsData, venuesData] = await Promise.all([authenticatedApi('/api/clubs/mine'), authenticatedApi('/api/places/mine')]);
      const list = organizationsData.clubs || []; setOrganizations(list); setMyVenues(venuesData.places || []);
      setVenuesByOrganization(Object.fromEntries(await Promise.all(list.map(async (organization) => [organization.id, (await authenticatedApi(`/api/clubs/${organization.id}`)).places || []]))));
    } catch (requestError) { setError(requestError.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  const openCreateOrganization = () => { setEditOrganization(null); setOrganizationForm({ ...EMPTY_ORGANIZATION, contactName: currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() : '', contactEmail: currentUser?.email || '', venue: { ...EMPTY_VENUE } }); setOrganizationDialog(true); };
  const openEditOrganization = (organization) => { setEditOrganization(organization); setOrganizationForm(organizationToForm(organization)); setOrganizationDialog(true); };
  const openCreateVenue = (organization = null) => { setEditVenue(null); setVenueOrganizationId(organization?.id || null); setVenueForm({ ...EMPTY_VENUE }); setVenueDialog(true); };
  const openEditVenue = (venue) => { setEditVenue(venue); setVenueOrganizationId(venue.clubId || null); setVenueForm(venueToForm(venue)); setVenueDialog(true); };
  async function saveOrganization(event) { event.preventDefault(); setSaving(true); setError(''); try { if (editOrganization) await authenticatedApi(`/api/clubs/${editOrganization.id}`, { method: 'PUT', body: JSON.stringify(organizationForm) }); else await authenticatedApi('/api/clubs', { method: 'POST', body: JSON.stringify(organizationForm) }); setMessage(editOrganization ? t('Organisation aktualisiert.') : t('Organisation eingereicht. Ein Admin muss sie noch freigeben.')); setOrganizationDialog(false); await load(); } catch (requestError) { setError(requestError.message); } finally { setSaving(false); } }
  async function saveVenue(event) { event.preventDefault(); setSaving(true); setError(''); const body = JSON.stringify({ ...venueForm, courtCount: venueForm.courtCount === '' ? 0 : Number(venueForm.courtCount) }); try { if (editVenue) await authenticatedApi(`/api/places/${editVenue.id}`, { method: 'PUT', body }); else if (venueOrganizationId) await authenticatedApi(`/api/clubs/${venueOrganizationId}/places`, { method: 'POST', body }); else await authenticatedApi('/api/places', { method: 'POST', body }); setMessage(t('Spielort gespeichert.')); setVenueDialog(false); await load(); } catch (requestError) { setError(requestError.message); } finally { setSaving(false); } }
  async function removeOrganization(organization) { if (!window.confirm(t('Organisation „{name}“ wirklich löschen? Der Spielort bleibt erhalten.').replace('{name}', organization.name))) return; setDeletingOrganizationId(organization.id); try { await authenticatedApi(`/api/clubs/${organization.id}`, { method: 'DELETE' }); setMessage(t('Organisation gelöscht.')); await load(); } catch (requestError) { setError(requestError.message); } finally { setDeletingOrganizationId(null); } }
  async function removeVenue(venue) { if (!window.confirm(`${venueLabel(venue, t)} ${t('wirklich löschen?')}`)) return; setDeletingVenueId(venue.id); try { await authenticatedApi(`/api/places/${venue.id}`, { method: 'DELETE' }); setMessage(t('Spielort gelöscht.')); await load(); } catch (requestError) { setError(requestError.message); } finally { setDeletingVenueId(null); } }
  async function openEditors(organization) { setEditorOrganization(organization); setEditorEmail(''); try { const data = await authenticatedApi(`/api/clubs/${organization.id}/editors`); setEditors(data.editors || []); } catch (requestError) { setError(requestError.message); } }
  async function addEditor(event) { event.preventDefault(); setSaving(true); try { await authenticatedApi(`/api/clubs/${editorOrganization.id}/editors`, { method: 'POST', body: JSON.stringify({ email: editorEmail }) }); const data = await authenticatedApi(`/api/clubs/${editorOrganization.id}/editors`); setEditors(data.editors || []); setEditorEmail(''); } catch (requestError) { setError(requestError.message); } finally { setSaving(false); } }
  async function removeEditor(editor) { setRemovingEditorId(editor.id); try { await authenticatedApi(`/api/clubs/${editorOrganization.id}/editors/${editor.id}`, { method: 'DELETE' }); setEditors((current) => current.filter((entry) => entry.id !== editor.id)); } catch (requestError) { setError(requestError.message); } finally { setRemovingEditorId(null); } }

  return <>{error && <p className="feedback error">{error}</p>}{message && <p className="feedback success">{message}</p>}
    <section className="panel"><div className="section-title"><h2>{t('Meine Organisationen')}</h2><Button onClick={openCreateOrganization}>{t('Organisation anlegen')}</Button></div>{loading ? <p className="muted">{t('Lädt …')}</p> : organizations.length === 0 ? <p className="muted">{t('Keine Vereine vorhanden.')}</p> : <div className="user-list">{organizations.map((organization) => <div key={organization.id}><article className="data-row"><div><strong data-i18n-skip>{organization.name}</strong><span>{t(organization.kind === 'group' ? 'Gruppe' : 'Verein')} · {organization.status === 'published' ? t('Veröffentlicht') : t('In Prüfung')}</span></div><div className="row-actions"><Button variant="secondary" onClick={() => openEditOrganization(organization)}>{t('Bearbeiten')}</Button><Button variant="secondary" onClick={() => openEditors(organization)}>{t('Bearbeiter')}</Button><Button variant="danger" disabled={deletingOrganizationId === organization.id} loading={deletingOrganizationId === organization.id} onClick={() => removeOrganization(organization)}>{t('Löschen')}</Button></div></article>{(venuesByOrganization[organization.id] || []).map((venue) => <article className="data-row club-places-list" key={venue.id}><div><strong data-i18n-skip>{venueLabel(venue, t)}</strong><span data-i18n-skip>{formatLocationAddress(venue.address)}</span></div><div className="row-actions"><Button variant="secondary" onClick={() => openEditVenue(venue)}>{t('Bearbeiten')}</Button><Button variant="danger" disabled={deletingVenueId === venue.id} loading={deletingVenueId === venue.id} onClick={() => removeVenue(venue)}>{t('Löschen')}</Button></div></article>)}{(venuesByOrganization[organization.id] || []).length < 2 && <Button variant="secondary" onClick={() => openCreateVenue(organization)}>{t('Spielort hinzufügen')}</Button>}</div>)}</div>}</section>
    <section className="panel"><div className="section-title"><h2>{t('Meine unabhängigen Spielorte')}</h2><Button onClick={() => openCreateVenue()}>{t('Spielort anlegen')}</Button></div>{!loading && (myVenues.length === 0 ? <p className="muted">{t('Noch keine eigenen Spielorte.')}</p> : <div className="user-list">{myVenues.map((venue) => <article className="data-row" key={venue.id}><div><strong data-i18n-skip>{venueLabel(venue, t)}</strong><span data-i18n-skip>{formatLocationAddress(venue.address)}</span></div><div className="row-actions"><Button variant="secondary" onClick={() => openEditVenue(venue)}>{t('Bearbeiten')}</Button><Button variant="danger" disabled={deletingVenueId === venue.id} loading={deletingVenueId === venue.id} onClick={() => removeVenue(venue)}>{t('Löschen')}</Button></div></article>)}</div>)}</section>
    <EditDialog open={organizationDialog} title={editOrganization ? t('Organisation bearbeiten') : t('Organisation anlegen')} error={error} onClose={() => setOrganizationDialog(false)}><form className="form" onSubmit={saveOrganization}><OrganizationFields form={organizationForm} setForm={setOrganizationForm} language={language} create={!editOrganization} /><div className="dialog-actions"><Button variant="secondary" onClick={() => setOrganizationDialog(false)}>{t('Abbrechen')}</Button><Button type="submit" loading={saving}>{t('Speichern')}</Button></div></form></EditDialog>
    <EditDialog open={venueDialog} title={editVenue ? t('Spielort bearbeiten') : t('Spielort anlegen')} error={error} onClose={() => setVenueDialog(false)}><form className="form" onSubmit={saveVenue}><BoulePlaceFields form={venueForm} setForm={setVenueForm} language={language} /><div className="dialog-actions"><Button variant="secondary" onClick={() => setVenueDialog(false)}>{t('Abbrechen')}</Button><Button type="submit" loading={saving}>{t('Speichern')}</Button></div></form></EditDialog>
    <EditDialog open={Boolean(editorOrganization)} title={t('Bearbeiter verwalten')} error={error} onClose={() => setEditorOrganization(null)}>{editorOrganization && <><form className="form" onSubmit={addEditor}><TextField label={t('E-Mail des registrierten Benutzers')} type="email" value={editorEmail} onChange={setEditorEmail} required /><Button type="submit" loading={saving}>{t('Hinzufügen')}</Button></form><div className="user-list">{editors.map((editor) => <article className="data-row" key={editor.id}><span data-i18n-skip>{editor.name || editor.email} ({editor.email})</span><Button variant="danger" disabled={removingEditorId === editor.id} loading={removingEditorId === editor.id} onClick={() => removeEditor(editor)}>{t('Entfernen')}</Button></article>)}</div></>}</EditDialog>
  </>;
}

export function MyClubsPage({ language, setLanguage, menuOpen, setMenuOpen, navigate, currentUser, isAdmin, onSelectAdminDashboard, onLogout, drawerContent, postboxControl }) {
  const { t } = useTranslation();
  return <main className="app-shell"><StandalonePageHeader heading={t('Meine Organisationen')} language={language} setLanguage={setLanguage} menuOpen={menuOpen} setMenuOpen={setMenuOpen} navigate={navigate} currentUser={currentUser} isAdmin={isAdmin} onSelectAdminDashboard={onSelectAdminDashboard} onLogout={onLogout} drawerContent={drawerContent} postboxControl={postboxControl} /><section className="single-column"><MyOrganizationsPanel language={language} currentUser={currentUser} /></section></main>;
}

export default MyClubsPage;
