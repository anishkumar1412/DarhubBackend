const testHttp = async () => {
  try {
    const loginRes = await fetch('http://localhost:5678/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: "rahul2@gmaii.com", password: "password123" })
    });

    console.log("Login Status:", loginRes.status);
    const loginData = await loginRes.json();
    console.log("Login Data:", loginData);

    if (loginData.token || loginData.access_token) {
      const token = loginData.token || loginData.access_token;
      console.log("Got token");

      const profileRes = await fetch('http://localhost:5678/api/farmer/bookings', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log("Profile Status:", profileRes.status);
      const profileData = await profileRes.json();
      console.log("Profile Data:", profileData);
    }
  } catch (err) {
    console.error(err);
  }
};

testHttp();
