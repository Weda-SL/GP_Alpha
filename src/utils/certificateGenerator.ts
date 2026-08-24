import { supabase } from '../lib/supabase';
import QRCode from 'qrcode';
import jsPDF from 'jspdf';

export async function generateCertificateUUID(): Promise<string> {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let uuid = '';
  let isUnique = false;

  while (!isUnique) {
    uuid = '';
    for (let i = 0; i < 15; i++) {
      uuid += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    const { data, error } = await supabase
      .from('orders')
      .select('id')
      .eq('certificate_uuid', uuid)
      .maybeSingle();

    if (error) {
      throw new Error(`Error checking certificate UUID uniqueness: ${error.message}`);
    }

    isUnique = !data;
  }

  return uuid;
}

interface CertificateOrder {
  id: string;
  order_number: string;
  created_at: string;
  batch_number: string | null;
  production_month: number | null;
  production_year: number | null;
  certificate_uuid: string;
  customer: {
    full_name: string;
    customer_profile: {
      business_name: string;
      business_code: string;
    } | null;
  } | null;
  plastic_type: {
    number: string;
    name: string;
  };
  plastic_grade: {
    number: string;
    name: string;
  };
  test_suite: {
    name: string;
    test_suite_items: {
      tests: {
        id: string;
        name: string;
        unit_of_measure: string;
      };
    }[];
  };
  order_results: {
    test_id: string;
    result: string | null;
    approval_status: string;
    tests: {
      name: string;
    };
  }[];
}

export async function generateCertificatePDF(order: CertificateOrder, logoDataUrl: string): Promise<Blob> {
  const qrCodeDataURL = await QRCode.toDataURL(order.certificate_uuid, {
    width: 120,
    margin: 1,
  });

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;

  pdf.setFontSize(22);
  pdf.text('GP Certified', pageWidth / 2, 20, { align: 'center' });

  if (logoDataUrl) {
    try {
      pdf.addImage(logoDataUrl, 'PNG', margin, 10, 30, 15);
    } catch (err) {
      console.error('Error adding logo to PDF:', err);
    }
  }

  pdf.setFontSize(14);
  pdf.text('Technical Data Sheet', pageWidth - margin, 20, { align: 'right' });

  let yPos = 40;

  pdf.setFillColor(240, 240, 240);
  pdf.rect(margin, yPos, contentWidth, 8, 'F');
  pdf.setFontSize(12);
  pdf.setFont(undefined, 'bold');
  pdf.text('Certificate Information', margin + 2, yPos + 5.5);
  yPos += 10;

  pdf.setFont(undefined, 'normal');
  pdf.setFontSize(10);
  pdf.text(`Certificate ID: ${order.certificate_uuid}`, margin + 2, yPos);
  yPos += 6;
  pdf.text(`Order Number: ${order.order_number}`, margin + 2, yPos);
  yPos += 6;
  pdf.text(`Issue Date: ${new Date(order.created_at).toLocaleDateString()}`, margin + 2, yPos);
  yPos += 10;

  pdf.setFillColor(240, 240, 240);
  pdf.rect(margin, yPos, contentWidth, 8, 'F');
  pdf.setFont(undefined, 'bold');
  pdf.setFontSize(12);
  pdf.text('Customer Information', margin + 2, yPos + 5.5);
  yPos += 10;

  pdf.setFont(undefined, 'normal');
  pdf.setFontSize(10);
  pdf.text(`Name: ${order.customer?.full_name || 'N/A'}`, margin + 2, yPos);
  yPos += 6;
  pdf.text(`Business: ${order.customer?.customer_profile?.business_name || 'N/A'}`, margin + 2, yPos);
  yPos += 6;
  pdf.text(`Business Code: ${order.customer?.customer_profile?.business_code || 'N/A'}`, margin + 2, yPos);
  yPos += 10;

  pdf.setFillColor(240, 240, 240);
  pdf.rect(margin, yPos, contentWidth, 8, 'F');
  pdf.setFont(undefined, 'bold');
  pdf.setFontSize(12);
  pdf.text('Material Information', margin + 2, yPos + 5.5);
  yPos += 10;

  pdf.setFont(undefined, 'normal');
  pdf.setFontSize(10);
  pdf.text(`Plastic Type: ${order.plastic_type.number} - ${order.plastic_type.name}`, margin + 2, yPos);
  yPos += 6;
  pdf.text(`Plastic Grade: ${order.plastic_grade.number} - ${order.plastic_grade.name}`, margin + 2, yPos);
  yPos += 6;
  if (order.batch_number) {
    pdf.text(`Batch Number: ${order.batch_number}`, margin + 2, yPos);
    yPos += 6;
  }
  if (order.production_month && order.production_year) {
    pdf.text(`Production Date: ${order.production_month}/${order.production_year}`, margin + 2, yPos);
    yPos += 6;
  }
  yPos += 4;

  pdf.setFillColor(240, 240, 240);
  pdf.rect(margin, yPos, contentWidth, 8, 'F');
  pdf.setFont(undefined, 'bold');
  pdf.setFontSize(12);
  pdf.text('Test Results', margin + 2, yPos + 5.5);
  yPos += 10;

  pdf.setFontSize(9);
  pdf.setFont(undefined, 'bold');
  const col1X = margin + 2;
  const col2X = margin + 80;
  const col3X = margin + 130;
  const col4X = margin + 160;

  pdf.text('Test Name', col1X, yPos);
  pdf.text('Result', col2X, yPos);
  pdf.text('Unit', col3X, yPos);
  pdf.text('Status', col4X, yPos);
  yPos += 6;

  pdf.setFont(undefined, 'normal');
  pdf.setFontSize(9);

  for (const item of order.test_suite.test_suite_items) {
    const result = order.order_results.find(r => r.test_id === item.tests.id);

    if (yPos > pageHeight - 30) {
      pdf.addPage();
      yPos = 20;
    }

    pdf.text(item.tests.name.substring(0, 40), col1X, yPos);
    pdf.text(result?.result || 'Pending', col2X, yPos);
    pdf.text(item.tests.unit_of_measure, col3X, yPos);

    const statusText = result?.approval_status || 'pending';
    const statusColor = statusText === 'approved' ? [0, 128, 0] : statusText === 'rejected' ? [255, 0, 0] : [128, 128, 128];
    pdf.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
    pdf.text(statusText.toUpperCase(), col4X, yPos);
    pdf.setTextColor(0, 0, 0);

    yPos += 6;
  }

  yPos += 10;

  if (qrCodeDataURL) {
    const qrSize = 40;
    pdf.addImage(qrCodeDataURL, 'PNG', pageWidth / 2 - qrSize / 2, yPos, qrSize, qrSize);
    yPos += qrSize + 5;

    pdf.setFontSize(8);
    pdf.text(`Scan to verify: ${order.certificate_uuid}`, pageWidth / 2, yPos, { align: 'center' });
  }

  pdf.setFontSize(8);
  pdf.setTextColor(100, 100, 100);
  const footerY = pageHeight - 20;
  pdf.text('GP Certified', pageWidth / 2, footerY, { align: 'center' });
  pdf.text('Address: 110/1, 5th Lane, Colombo 00300 Sri Lanka', pageWidth / 2, footerY + 4, { align: 'center' });
  pdf.text('Email: info@gpcertified.co', pageWidth / 2, footerY + 8, { align: 'center' });
  pdf.text('Website: www.gpcertified.co', pageWidth / 2, footerY + 12, { align: 'center' });

  return pdf.output('blob');
}

export async function storeCertificate(orderId: string, certificateUUID: string, pdfBlob: Blob): Promise<string> {
  const filePath = `${orderId}/certificate_${certificateUUID}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from('certificates')
    .upload(filePath, pdfBlob, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Failed to upload certificate: ${uploadError.message}`);
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({ certificate_path: filePath })
    .eq('id', orderId);

  if (updateError) {
    throw new Error(`Failed to update order with certificate path: ${updateError.message}`);
  }

  return filePath;
}

export async function downloadCertificateFromStorage(filePath: string, fileName: string): Promise<void> {
  const { data, error } = await supabase.storage
    .from('certificates')
    .download(filePath);

  if (error) {
    throw new Error(`Failed to download certificate: ${error.message}`);
  }

  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
