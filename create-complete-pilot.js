import fs from 'fs';
import path from 'path';

async function createCompletePilot() {
  // Create dummy files for upload
  const dummyJpgPath = path.join(process.cwd(), 'dummy_profile.jpg');
  const dummyPdfPath = path.join(process.cwd(), 'dummy_doc.pdf');
  
  if (!fs.existsSync(dummyJpgPath)) fs.writeFileSync(dummyJpgPath, 'dummy jpg content');
  if (!fs.existsSync(dummyPdfPath)) fs.writeFileSync(dummyPdfPath, 'dummy pdf content');

  const form = new FormData();
  
  // Basic Text Fields
  form.append('first_name', 'Rahul');
  form.append('last_name', 'FullPilot');
  form.append('email', 'rahul.fullpilot3@example.com');
  form.append('password', 'securepassword123');
  form.append('mobile_number', '9876500003');
  form.append('dob', '1985-06-15');
  form.append('aadhar_number', '987654321098');
  form.append('pan_card_number', 'ABCDE1234F');
  form.append('upi_id', 'rahul@okicici');
  form.append('isverifyEmail', 'true');
  form.append('isMobileVerify', 'true');
  
  // Address
  form.append('address', JSON.stringify([
    {
      state: "1",
      district: "2",
      block: "3",
      lane1: "Main Aviation Road",
      lane2: "Near Hangar 4",
      village: "AeroCity",
      pincode: "110037",
      is_primary: true
    },
    {
      state: "1",
      district: "2",
      block: "3",
      lane1: "Secondary Residence",
      village: "FlightTown",
      pincode: "110038",
      is_primary: false
    }
  ]));

  // Bank Details
  form.append('bank_details', JSON.stringify([
    {
      bank_name: "HDFC Bank",
      acc_holder_name: "Rahul FullPilot",
      acc_number: "501002345678",
      ifsc_code: "HDFC0001234",
      is_primary: true
    }
  ]));

  // File Uploads (Converting local files to Blobs for FormData)
  const jpgBlob = new Blob([fs.readFileSync(dummyJpgPath)], { type: 'image/jpeg' });
  const pdfBlob = new Blob([fs.readFileSync(dummyPdfPath)], { type: 'application/pdf' });

  form.append('profile_image', jpgBlob, 'dummy_profile.jpg');
  form.append('aaddhar_image', jpgBlob, 'dummy_aadhar.jpg');
  form.append('pan_card_image', pdfBlob, 'dummy_pan.pdf');
  form.append('dcga_pilot_cert', pdfBlob, 'dummy_dgca_cert.pdf');
  form.append('dcga_pilot_license', pdfBlob, 'dummy_dgca_license.pdf');
  form.append('medical_certificate', pdfBlob, 'dummy_medical.pdf');
  form.append('insurance_doc', pdfBlob, 'dummy_insurance.pdf');
  form.append('passbook_image', jpgBlob, 'dummy_passbook.jpg');

  try {
    const response = await fetch('http://localhost:5678/api/user/pilot-registration', {
      method: 'POST',
      body: form
    });
    
    const data = await response.json();
    console.log("Registration Status:", response.status);
    console.log("Registration Response:", JSON.stringify(data, null, 2));

    if (data.success && data.token) {
      // Test the new GET API
      console.log("\nTesting GET /api/user/pilot/profile...");
      
      const tabs = ['main', 'personal', 'address', 'bank', 'documents'];
      
      for (const tab of tabs) {
        const getResponse = await fetch(`http://localhost:5678/api/user/pilot/profile?tab=${tab}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${data.token}`
          }
        });
        
        const profileData = await getResponse.json();
        console.log(`\n--- Profile Tab: ${tab.toUpperCase()} ---`);
        console.log(JSON.stringify(profileData.data, null, 2));
      }
    }
  } catch (error) {
    console.error("Request failed:", error);
  } finally {
    // Cleanup dummy files
    if (fs.existsSync(dummyJpgPath)) fs.unlinkSync(dummyJpgPath);
    if (fs.existsSync(dummyPdfPath)) fs.unlinkSync(dummyPdfPath);
  }
}

createCompletePilot();
