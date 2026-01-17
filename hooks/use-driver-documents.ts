import { Alert } from 'react-native';
import { useCallback, useState } from 'react';

import { pickProfileDocument } from '@/app/utils/image-picker';
import { uploadDriverDocument } from '@/app/services/driver-documents';
import { updateDriverLicense } from '@/app/services/security';
import { uploadDriverLicenseSide } from '@/src/storageUploads';
import { updateUserDocuments } from '@/src/firestoreUsers';

export const useDriverDocumentUploader = (email: string | null | undefined) => {
  const [documentUploading, setDocumentUploading] = useState<'front' | 'back' | null>(null);

  const handleReplaceDocument = useCallback(
    async (side: 'front' | 'back') => {
      if (!email) return;
      const uri = await pickProfileDocument();
      if (!uri) return;
      setDocumentUploading(side);
      try {
        const previewUpload = uploadDriverLicenseSide({ email, uri, side });
        const reviewUpload = uploadDriverDocument({
          email,
          documentType: side === 'front' ? 'license_front' : 'license_back',
          uri,
        });
        const [previewUrl] = await Promise.all([previewUpload, reviewUpload]);
        updateDriverLicense(email, { side, url: previewUrl });
        await updateUserDocuments(
          email,
          side === 'front'
            ? { driverLicenseRecto: previewUrl }
            : { driverLicenseVerso: previewUrl }
        );
      } catch (error) {
        console.warn('driver document upload failed', error);
        Alert.alert('Erreur', 'Impossible d’envoyer ce document pour le moment.');
      } finally {
        setDocumentUploading(null);
      }
    },
    [email]
  );

  return { documentUploading, handleReplaceDocument };
};
