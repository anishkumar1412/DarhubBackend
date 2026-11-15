async function createPilot() {
  const form = new FormData();
  
  form.append('first_name', 'Ramesh');
  form.append('last_name', 'Pilot');
  form.append('email', 'ramesh.pilot2@example.com');
  form.append('password', 'password123');
  form.append('mobile_number', '9876543123');
  form.append('dob', '1990-01-01');
  form.append('aadhar_number', '123456789012');
  form.append('isverifyEmail', 'true');
  form.append('isMobileVerify', 'true');
  
  // Add structured data
  form.append('address', JSON.stringify([{
    state: "1",
    district: "2",
    block: "3",
    lane1: "Pilot Street 1",
    village: "Aji",
    pincode: "360003",
    is_primary: true
  }]));

  form.append('bank_details', JSON.stringify([{
    bank_name: "SBI",
    acc_holder_name: "Ramesh Pilot",
    acc_number: "123456789",
    ifsc_code: "SBIN0001",
    is_primary: true
  }]));

  try {
    const response = await fetch('http://localhost:5678/api/user/pilot-registration', {
      method: 'POST',
      body: form
    });
    
    const data = await response.json();
    console.log("Status:", response.status);
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Request failed:", error);
  }
}

createPilot();
