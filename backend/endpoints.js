[
  // AUTH ROUTES
  {
    path: '/api/v1/auth/login-request',
    method: 'POST',
    body: { aadhaarNumber: 'string' },
    description: 'Request OTP for login using Aadhaar number.'
  },
  {
    path: '/api/v1/auth/verify-otp',
    method: 'POST',
    body: { aadhaarNumber: 'string', otpCode: 'string' },
    description: 'Verify OTP and log in user.'
  },
  {
    path: '/api/v1/auth/profile/:patientId',
    method: 'GET',
    params: { patientId: 'string' },
    description: 'Get user profile by patient ID.'
  },

  // DOCTOR ROUTES
  {
    path: '/api/v1/doctor/queue/:staffId',
    method: 'GET',
    params: { staffId: 'string' },
    description: "Get doctor's live queue."
  },
  {
    path: '/api/v1/doctor/update-status',
    method: 'PATCH',
    body: { appointmentId: 'string', status: "'in-consult' | 'completed'" },
    description: 'Update patient status in queue.'
  },
  {
    path: '/api/v1/doctor/prescribe',
    method: 'POST',
    body: { appointmentId: 'string', diagnosis: 'string', meds: 'array', tests: 'array', isInpatient: 'boolean (optional)' },
    description: 'Prescribe medication and finalize consultation.'
  },

  // HOSPITAL ROUTES
  {
    path: '/api/v1/hospital/login',
    method: 'POST',
    body: { email: 'string', password: 'string' },
    description: 'Hospital login.'
  },
  {
    path: '/api/v1/hospital/details/:id',
    method: 'GET',
    params: { id: 'string' },
    description: 'Get hospital details.'
  },
  {
    path: '/api/v1/hospital/stats/:hospitalId',
    method: 'GET',
    params: { hospitalId: 'string' },
    description: 'Get hospital statistics.'
  },
  {
    path: '/api/v1/hospital/update-stats',
    method: 'POST',
    body: { hospitalId: 'string', ...'other stats fields' },
    description: 'Update hospital statistics.'
  },
  {
    path: '/api/v1/hospital/patient-records/:hospitalId',
    method: 'GET',
    params: { hospitalId: 'string' },
    description: 'Get patient records for a hospital.'
  },

  // PATIENT ROUTES
  {
    path: '/api/v1/patient/diagnose',
    method: 'POST',
    body: { symptomText: 'string', userLat: 'number', userLong: 'number' },
    description: 'AI triage and doctor/hospital recommendation.'
  },

  // PHARMACY ROUTES
  {
    path: '/api/v1/pharmacy/dispense',
    method: 'POST',
    body: { accessCode: 'string', hospitalId: 'string' },
    description: 'Dispense medication for a prescription.'
  },
  {
    path: '/api/v1/pharmacy/add-inventory',
    method: 'POST',
    body: { hospitalId: 'string', medicineName: 'string', stockQuantity: 'number', threshold_limit: 'number', unitPrice: 'number' },
    description: 'Add or update pharmacy inventory.'
  },
  {
    path: '/api/v1/pharmacy/my-inventory/:hospitalId',
    method: 'GET',
    params: { hospitalId: 'string' },
    description: 'Get pharmacy inventory for a hospital.'
  }
];
