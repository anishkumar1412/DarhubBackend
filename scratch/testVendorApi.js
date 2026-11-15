import { Blob } from 'buffer';

const API_URL = 'http://localhost:5678/api/vendors';

const testApiInsert = async () => {
  console.log('Checking if backend server is running on http://localhost:5678...');
  try {
    const healthCheck = await fetch('http://localhost:5678/');
    if (!healthCheck.ok) {
      throw new Error('Server returned non-ok status');
    }
  } catch (err) {
    console.error('\n❌ Error: The backend server is NOT running.');
    console.error('Please start the server first by running: npm run dev');
    console.error('Then, run this test script again.\n');
    process.exit(1);
  }

  console.log('✅ Server is online. Preparing multipart form data...');

  const formData = new FormData();

  // 1. Basic Info
  formData.append('vendor_name', 'API Test Vendor Ltd');
  formData.append('vendor_type', 'Distributor');
  formData.append('category', 'Propeller');
  formData.append('gst_number', '22AAAAA1111A1Z1');
  formData.append('pan_number', 'AAAAA1111A');
  formData.append('company_business_name', 'API Test Brand');
  formData.append('business_address', '101 Cyber Plaza, Sector 62');
  formData.append('state', '1');
  formData.append('district', '3');
  formData.append('city_town', 'Noida');
  formData.append('pincode', '201301');

  // Add dummy files using Blob
  const dummyLogo = new Blob(['dummy image content'], { type: 'image/png' });
  formData.append('vendor_logo', dummyLogo, 'test_logo.png');

  const dummyGstDoc = new Blob(['dummy pdf content'], { type: 'application/pdf' });
  formData.append('business_doc_gst_cert', dummyGstDoc, 'gst_doc.pdf');

  // 2. Address Info
  formData.append('primary_contact_name', 'Jane Smith');
  formData.append('designation', 'VP Supply Chain');
  formData.append('mobile_number', '9888877777');
  formData.append('email_address', 'jane@testvendor.com');
  formData.append('communication_address', '101 Cyber Plaza, Sector 62');
  formData.append('same_as_business_address', 'true');
  formData.append('comm_state', '1');
  formData.append('comm_district', '3');
  formData.append('comm_city_town', 'Noida');
  formData.append('comm_pincode', '201301');

  // 3. KYC Details
  formData.append('business_type', 'LLP');
  formData.append('entity_type', 'Company');
  formData.append('business_name_as_pan', 'API TEST BRAND LLP');
  formData.append('kyc_pan_number', 'AAAAA1111A');
  
  const dummyPanCard = new Blob(['dummy pan image'], { type: 'image/jpeg' });
  formData.append('pan_card', dummyPanCard, 'pan_card.jpg');

  formData.append('director_full_name', 'Robert Downey');
  formData.append('director_mobile', '9555544444');
  formData.append('director_email', 'robert@testvendor.com');

  // 4. Bank Details
  formData.append('account_holder_name', 'API TEST BRAND LLP');
  formData.append('bank_name', 'ICICI Bank');
  formData.append('branch_name', 'Noida Phase 2');
  formData.append('account_number', '000111222333');
  formData.append('confirm_account_number', '000111222333');
  formData.append('ifsc_code', 'ICIC0000001');
  formData.append('account_type', 'Current');

  const dummyCheque = new Blob(['dummy cheque image'], { type: 'image/png' });
  formData.append('cancelled_cheque_passbook', dummyCheque, 'cancelled_cheque.png');

  console.log('Sending POST request to /api/vendors...');
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();
    console.log('\n--- Server Response ---');
    console.log('Status Code:', response.status);
    console.log('Body:', JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('\n🎉 API Insert Test PASSED successfully!');
    } else {
      console.log('\n❌ API Insert Test FAILED!');
    }
  } catch (error) {
    console.error('Error during API request:', error);
  }
};

testApiInsert();
