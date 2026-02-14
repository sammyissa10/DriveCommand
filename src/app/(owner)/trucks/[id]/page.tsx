import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTruck } from '@/app/(owner)/actions/trucks';
import { listDocuments } from '@/app/(owner)/actions/documents';
import { documentMetadataSchema } from '@/lib/validations/truck.schemas';
import { TruckDocumentsSection } from './truck-documents-section';

interface TruckDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TruckDetailPage({ params }: TruckDetailPageProps) {
  const { id } = await params;
  const truck = await getTruck(id);

  if (!truck) {
    notFound();
  }

  // Fetch documents for this truck
  const documents = await listDocuments('truck', id);

  // Parse and validate document metadata
  let documentMetadata = null;
  if (truck.documentMetadata) {
    const parsed = documentMetadataSchema.safeParse(truck.documentMetadata);
    if (parsed.success) {
      documentMetadata = parsed.data;
    }
  }

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return null;
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/trucks" className="text-blue-600 hover:text-blue-800 mb-2 inline-block">
          ← Back to Trucks
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">
            {truck.year} {truck.make} {truck.model}
          </h1>
          <Link
            href={`/trucks/${truck.id}/edit`}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md"
          >
            Edit Truck
          </Link>
        </div>
      </div>

      {/* Main Details */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Vehicle Information</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <dt className="text-sm font-medium text-gray-500">VIN</dt>
            <dd className="mt-1 text-base text-gray-900">{truck.vin}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">License Plate</dt>
            <dd className="mt-1 text-base text-gray-900">{truck.licensePlate}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Odometer</dt>
            <dd className="mt-1 text-base text-gray-900">
              {truck.odometer.toLocaleString()} miles
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Created</dt>
            <dd className="mt-1 text-base text-gray-900">
              {formatDate(truck.createdAt.toISOString())}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
            <dd className="mt-1 text-base text-gray-900">
              {formatDate(truck.updatedAt.toISOString())}
            </dd>
          </div>
        </div>
      </div>

      {/* Document Metadata */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Document Information</h2>
        {documentMetadata &&
        (documentMetadata.registrationNumber ||
          documentMetadata.registrationExpiry ||
          documentMetadata.insuranceNumber ||
          documentMetadata.insuranceExpiry) ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {documentMetadata.registrationNumber && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Registration Number</dt>
                <dd className="mt-1 text-base text-gray-900">
                  {documentMetadata.registrationNumber}
                </dd>
              </div>
            )}
            {documentMetadata.registrationExpiry && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Registration Expiry</dt>
                <dd className="mt-1 text-base text-gray-900">
                  {formatDate(documentMetadata.registrationExpiry)}
                </dd>
              </div>
            )}
            {documentMetadata.insuranceNumber && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Insurance Number</dt>
                <dd className="mt-1 text-base text-gray-900">
                  {documentMetadata.insuranceNumber}
                </dd>
              </div>
            )}
            {documentMetadata.insuranceExpiry && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Insurance Expiry</dt>
                <dd className="mt-1 text-base text-gray-900">
                  {formatDate(documentMetadata.insuranceExpiry)}
                </dd>
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-500">No document information recorded</p>
        )}
      </div>

      {/* Files Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold mb-4">Files</h2>
        <TruckDocumentsSection truckId={truck.id} initialDocuments={documents} />
      </div>
    </div>
  );
}
