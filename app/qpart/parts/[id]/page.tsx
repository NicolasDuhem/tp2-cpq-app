import QPartPartFormPage from '@/components/qpart/qpart-part-form-page';

type Params = { params: { id: string } };

export default function QPartEditPartRoute({ params }: Params) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return <section className="pageRoot">Invalid part id.</section>;
  }

  return <QPartPartFormPage partId={id} />;
}
