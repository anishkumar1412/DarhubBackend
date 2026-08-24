const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTYwLCJlbWFpbCI6InJhaHVsMkBnbWFpaS5jb20iLCJpYXQiOjE3ODcxNTMwNzgsImV4cCI6MTc4NzQxMjI3OH0.-KB3VzbuJiorxGqvvvmRxAReZJZRz4wBcnY52ymYyyI";

const testHttp = async () => {
  try {
    const profileRes = await fetch('http://localhost:5678/api/farmer/profile?tab=main', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log("Profile Status:", profileRes.status);
    const profileText = await profileRes.text();
    console.log("Profile Data:", profileText);
  } catch (err) {
    console.error(err);
  }
};
testHttp();
