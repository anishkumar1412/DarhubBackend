# Test cases (sourced by e2e.sh). Each run uses fresh e-mails / mobiles.
mob() { printf "9%09d" $(( (RUN * 7 + $1) % 1000000000 )); }
FEMAIL="farmer$RUN@example.com"; FMOB=$(mob 1)
F2MOB=$(mob 2)                                   # mobile-only farmer
PEMAIL="pilot$RUN@example.com"; PMOB=$(mob 3)
PASSWD='Farmer@123'

# ═════════════════════════════════════════════ public
section "Public endpoints"
req GET /;                                   check "GET / welcome" 200
req GET /health;                             check "GET /health" 200 '.status=="ok"'
req GET /api/locations/states;               check "states list" 200 'length > 0'
req GET /api/locations/districts/$STATE;     check "districts of state" 200 'length > 0'
req GET /api/locations/blocks/$DISTRICT;     check "blocks of district" 200 'length > 0'
req GET /api/locations/panchayats/$BLOCK;    check "panchayats of block" 200
req GET /api/locations/districts/abc;        check "districts with non-numeric id -> 400" 400
req GET /api/otp/settings;                   check "otp settings" 200 '.otp_length==6'
req GET /api/nope;                           check "unknown route -> JSON 404" 404 '.code=="ROUTE_NOT_FOUND"'
req POST /api/login '{bad json';             check "malformed JSON -> 400" 400

# ═════════════════════════════════════════════ admin bootstrap
section "Admin: setup password, login"
SETUP_TOKEN=$(grep -o 'setup-password?token=[0-9a-f]*' "$DIR/server.log" | tail -1 | cut -d= -f2)
if [ -n "$SETUP_TOKEN" ]; then
  req POST /admin/auth/setup-password "{\"token\":\"$SETUP_TOKEN\",\"password\":\"Admin@12345\",\"confirm_password\":\"Admin@12345\"}"
  if [ "$STATUS" = 200 ]; then check "admin setup-password" 200; else echo "(setup token already used: $STATUS)"; fi
fi
req POST /admin/auth/login '{"email":"superadmin@example.com","password":"wrong-pass"}'; check "admin login wrong password -> 401" 401
req POST /admin/auth/login '{"email":"superadmin@example.com","password":"Admin@12345"}'; check "admin login" 200 '.data.token != null'
ADMIN=$(j .data.token)
req GET /admin/auth/me "" "$ADMIN";         check "admin /me" 200

# ═════════════════════════════════════════════ OTP + farmer registration (email)
section "Farmer registration with e-mail"
req POST /api/otp/send-otp '{}';                                   check "send-otp without target -> 400" 400 '.code=="VALIDATION_ERROR"'
req POST /api/otp/send-otp '{"email":"not-an-email"}';             check "send-otp bad email -> 400" 400
req POST /api/otp/send-otp '{"mobile_number":"12345"}';            check "send-otp bad mobile -> 400" 400
form POST /api/user/farmer-registration "" -F first_name=Ravi -F last_name=Patil -F email=$FEMAIL -F mobile_number=$FMOB -F password=$PASSWD
check "register before verifying -> 400" 400 '(.message|test("verify"))'
req POST /api/otp/send-otp "{\"email\":\"$FEMAIL\",\"mobile_number\":\"$FMOB\"}"; check "send-otp email+mobile" 200 '.email_otp_required==true'
EOTP=$(j .dev_otps.email_otp); MOTP=$(j .dev_otps.mobile_otp)
req POST /api/otp/send-otp "{\"email\":\"$FEMAIL\"}";               check "resend within cooldown -> 429" 429
req POST /api/otp/verify-otp "{\"email\":\"$FEMAIL\",\"mobile_number\":\"$FMOB\",\"email_otp\":\"000000\",\"mobile_otp\":\"$MOTP\"}"; check "verify wrong email otp -> 400" 400 '.code=="OTP_INVALID"'
req POST /api/otp/verify-otp "{\"email\":\"$FEMAIL\",\"mobile_number\":\"$FMOB\",\"email_otp\":\" $EOTP \",\"mobile_otp\":\"$MOTP\"}"; check "verify otp (code with spaces)" 200 '.isEmailVerify==true'

form POST /api/user/farmer-registration "" -F first_name= -F last_name=Patil -F email=$FEMAIL -F mobile_number=$FMOB -F password=$PASSWD
check "register: missing first name -> 400" 400 '.code=="VALIDATION_ERROR"'
form POST /api/user/farmer-registration "" -F first_name=Ravi -F last_name=Patil -F email=$FEMAIL -F mobile_number=$FMOB -F password=short
check "register: short password -> 400" 400 '(.message|test("8 characters"))'
form POST /api/user/farmer-registration "" -F first_name=Ravi -F last_name=Patil -F email=$FEMAIL -F mobile_number=$FMOB -F password=$PASSWD -F dob=31/02/1990
check "register: impossible dob -> 400" 400
form POST /api/user/farmer-registration "" -F first_name=Ravi -F last_name=Patil -F email=$FEMAIL -F mobile_number=$FMOB -F password=$PASSWD \
  -F "address={\"state\":$STATE,\"district\":$OTHER_DISTRICT,\"block\":$BLOCK,\"village\":\"X\",\"pincode\":\"411001\"}"
check "register: district not in state -> 400" 400 '(.message|test("district"))'
form POST /api/user/farmer-registration "" -F first_name=Ravi -F last_name=Patil -F email=$FEMAIL -F mobile_number=$FMOB -F password=$PASSWD -F "profile_image=@$TXT;type=text/plain"
check "register: text file as photo -> 400" 400 '(.message|test("invalid format"))'
form POST /api/user/farmer-registration "" -F first_name=Ravi -F last_name=Patil -F email=$FEMAIL -F "mobile_number=+91 ${FMOB:0:5} ${FMOB:5}" -F password=$PASSWD \
  -F dob=12/05/1990 -F role=1 -F isverifyEmail=true -F "address=[$ADDR]"
check "register farmer (+91 formatted mobile, role/flags in body ignored)" 201 '.token != null and .refreshToken != null'
FARMER=$(j .token); FARMER_REFRESH=$(j .refreshToken); FARMER_ID=$(j .user_id)
form POST /api/user/farmer-registration "" -F first_name=Ravi -F last_name=Patil -F email=$FEMAIL -F mobile_number=$FMOB -F password=$PASSWD
check "register same person again -> 409 or verification needed" 400 '(.message|test("verify"))'
req POST /api/otp/send-otp "{\"email\":\"$FEMAIL\"}";               check "send-otp for registered email -> 409" 409 '.code=="ALREADY_EXISTS"'
FARMER_ROLE=$(PGPASSWORD=testpass psql -h 127.0.0.1 -p 55432 -U postgres -d darhub_test -At -c "SELECT r.role_name||'/'||u.user_type||'/'||u.mobile_number||'/'||u.\"isEmailVerify\" FROM \"USER\" u JOIN \"USER_ROLE\" ur ON ur.user_id=u.id JOIN \"MASTER_ROLE\" r ON r.id=ur.role_id WHERE u.id=$FARMER_ID")
STATUS=200; BODY="\"$FARMER_ROLE\""; check "stored: Farmer role, type 3, normalised mobile, email verified ($FARMER_ROLE)" 200 "(. | test(\"^[Ff]armer/3/$FMOB/true$\"))"

# ═════════════════════════════════════════════ mobile-only farmer (SMS console provider)
section "Farmer registration with mobile only"
req POST /api/otp/send-otp "{\"mobile_number\":\"$F2MOB\"}";        check "send-otp mobile only" 200 '.mobile_otp_required==true'
M2=$(j .dev_otps.mobile_otp)
req POST /api/otp/verify-otp "{\"mobile_number\":\"$F2MOB\",\"mobile_otp\":\"$M2\"}"; check "verify mobile otp" 200 '.isMobileVerify==true'
form POST /api/user/farmer-registration "" -F first_name=Sita -F last_name=Devi -F email= -F mobile_number=$F2MOB -F password=$PASSWD
check "register farmer without e-mail" 201
FARMER2=$(j .token); FARMER2_ID=$(j .user_id)

# ═════════════════════════════════════════════ login / refresh / me
section "Login, refresh, me"
req POST /api/login '{"password":"x"}';                              check "login without identifier -> 400" 400
req POST /api/login "{\"email\":\"nobody$RUN@example.com\",\"password\":\"$PASSWD\"}"; check "login unknown -> 404" 404
req POST /api/login "{\"email\":\"$FEMAIL\",\"password\":\"Wrong@123\"}"; check "login wrong password -> 401" 401
req POST /api/login "{\"email\":\"${FEMAIL^^}\",\"password\":\"$PASSWD\"}"; check "login with upper-case email" 200 '.user.user_type==3'
req POST /api/login "{\"mobile_number\":\"+91$FMOB\",\"password\":\"$PASSWD\"}"; check "login with +91 mobile" 200
req POST /api/login "{\"identifier\":\"$FMOB\",\"password\":\"$PASSWD\"}"; check "login with identifier" 200
FARMER=$(j .token); FARMER_REFRESH=$(j .refreshToken)
req POST /api/refresh-token "" "$FARMER_REFRESH";                    check "refresh token" 200 '.token != null'
NEW_REFRESH=$(j .refreshToken); FARMER=$(j .token)
req POST /api/refresh-token "" "$FARMER_REFRESH";                    check "old refresh token reused -> 401" 401
req POST /api/refresh-token "" "$FARMER";                            check "access token used as refresh -> 401" 401
req POST /api/refresh-token "" "$NEW_REFRESH";                       check "rotated refresh token works" 200
FARMER=$(j .token)
req GET /api/me "" "$FARMER";                                        check "GET /api/me" 200 ".user.id==$FARMER_ID"
req GET /api/user/me "" "$FARMER";                                   check "GET /api/user/me" 200
req GET /api/me "" "garbage";                                        check "me with bad token -> 401" 401

# ═════════════════════════════════════════════ farmer profile
section "Farmer profile"
for tab in main personal farm address bank; do req GET "/api/farmer/profile?tab=$tab" "" "$FARMER"; check "profile tab=$tab" 200 '.success==true'; done
req GET /api/farmer/profile "" "$FARMER";                            check "profile without tab -> 400" 400
req GET "/api/farmer/profile?tab=xyz" "" "$FARMER";                  check "profile unknown tab -> 400" 400
req GET "/api/farmer/profile?tab=main" "" "$FARMER";                 check "main tab: verified + member_since" 200 '.data.user_info.verified==true and .data.user_info.member_since != null'
req GET "/api/farmer/profile?tab=personal" "" "$FARMER";             check "personal tab has primary address names" 200 '.data.address_details.state_name != null'
req PATCH "/api/farmer/profile?tab=personal" '{"personal_info":{"first_name":"  Ravindra ","dob":"1991-03-04","whatsapp_number":"+91 '$FMOB'"}}' "$FARMER"
check "patch personal names/dob/whatsapp" 200
req GET "/api/farmer/profile?tab=personal" "" "$FARMER";             check "  -> saved (trimmed, ISO dob)" 200 '.data.personal_info.first_name=="Ravindra" and (.data.personal_info.dob|startswith("1991-03-04"))'
req PATCH "/api/farmer/profile?tab=personal" '{"personal_info":{"email":"bad"}}' "$FARMER";               check "patch invalid email -> 400" 400
req PATCH "/api/farmer/profile?tab=personal" "{\"personal_info\":{\"mobile_number\":\"$F2MOB\"}}" "$FARMER"; check "patch mobile of another account -> 409" 409
req PATCH "/api/farmer/profile?tab=personal" "{\"personal_info\":{\"email\":\"new$RUN@example.com\"}}" "$FARMER"; check "patch new email without OTP -> 400" 400 '(.message|test("Verify"))'
req POST /api/otp/send-otp "{\"email\":\"new$RUN@example.com\",\"purpose\":\"change\"}";  NEOTP=$(j .dev_otps.email_otp)
req POST /api/otp/verify-otp "{\"email\":\"new$RUN@example.com\",\"email_otp\":\"$NEOTP\"}"; check "verify new email" 200
req PATCH "/api/farmer/profile?tab=personal" "{\"personal_info\":{\"email\":\"NEW$RUN@example.com\"}}" "$FARMER"; check "patch new email after OTP" 200
req POST /api/login "{\"email\":\"new$RUN@example.com\",\"password\":\"$PASSWD\"}"; check "login with the new email" 200
FARMER=$(j .token)
req PATCH "/api/farmer/profile?tab=personal" '{"personal_info":{"profile_image":"https://evil.example/x.png"}}' "$FARMER"; check "patch foreign photo URL -> 400" 400
req PATCH "/api/farmer/profile?tab=personal" '{"address_details":{"village":"Kharadi","pincode":"411014"}}' "$FARMER"; check "patch primary address (partial)" 200
req PATCH "/api/farmer/profile?tab=personal" "{\"address_details\":{\"district\":$OTHER_DISTRICT}}" "$FARMER";       check "patch address district not in state -> 400" 400
req PATCH "/api/farmer/profile?tab=farm" '{}' "$FARMER";             check "patch unsupported tab -> 400" 400

# ═════════════════════════════════════════════ addresses / bank / UPI
section "Addresses, bank accounts, UPI"
req POST /api/farmer/addresses "{\"lane_1\":\"Field 2\",\"state\":$STATE,\"district\":$DISTRICT,\"block\":$BLOCK,\"village\":\"Lohegaon\",\"pincode\":\"411047\"}" "$FARMER"
check "add farm address" 201 '.data.is_primary==false and .data.block_name != null'; ADDR2=$(j .data.id)
req POST /api/farmer/addresses "{\"lane_1\":\"x\",\"state\":$STATE,\"district\":$OTHER_DISTRICT,\"block\":$BLOCK,\"village\":\"v\",\"pincode\":\"411047\"}" "$FARMER"; check "add address with wrong district -> 400" 400
req POST /api/farmer/addresses '{"lane_1":"x"}' "$FARMER";           check "add address missing fields -> 400 listing them" 400 '(.errors|length) >= 4'
req PATCH /api/farmer/addresses/$ADDR2 '{"village":"Viman Nagar","is_primary":"true"}' "$FARMER"; check "update address + make primary" 200 '.data.is_primary==true'
req GET "/api/farmer/profile?tab=address" "" "$FARMER";              check "exactly one primary address" 200 '([.data.addresses[]|select(.is_primary)]|length)==1'
req PATCH /api/farmer/addresses/$ADDR2 '{"is_primary":false}' "$FARMER"; check "unset the primary directly -> 400" 400
req DELETE /api/farmer/addresses/$ADDR2 "" "$FARMER";                check "delete primary while others exist -> 400" 400
req PATCH /api/farmer/addresses/abc '{}' "$FARMER";                  check "address id not numeric -> 400" 400
req PATCH /api/farmer/addresses/$ADDR2 '{"village":"Hack"}' "$FARMER2"; check "other farmer's address -> 404" 404

req POST /api/farmer/bank-accounts '{"bank_name":"SBI","acc_holder_name":"Ravi","acc_number":"1234 5678 9012","ifsc_code":"sbin0001234"}' "$FARMER"
check "add bank account (masked, IFSC upper-cased)" 201 '.data.acc_number=="XXXX XXXX 9012" and .data.ifsc_code=="SBIN0001234" and .data.is_primary==true'; BANK=$(j .data.id)
req POST /api/farmer/bank-accounts '{"bank_name":"SBI","acc_holder_name":"Ravi","acc_number":"123456789012","ifsc_code":"SBIN0001234"}' "$FARMER"; check "duplicate bank account -> 409" 409
req POST /api/farmer/bank-accounts '{"bank_name":"SBI","acc_holder_name":"R","acc_number":"12","ifsc_code":"X"}' "$FARMER"; check "bad account/IFSC -> 400" 400 '(.errors|length)==2'
req POST /api/farmer/bank-accounts '{"bank_name":"HDFC","acc_holder_name":"Ravi","acc_number":"99887766554","ifsc_code":"HDFC0000123","is_primary":true}' "$FARMER"; check "second account as primary" 201; BANK2=$(j .data.id)
req GET "/api/farmer/profile?tab=bank" "" "$FARMER";                 check "bank tab: one primary, masked" 200 '([.data.bank_accounts[]|select(.is_primary)]|length)==1 and (all(.data.bank_accounts[]; .acc_number|startswith("XXXX")))'
req PATCH /api/farmer/bank-accounts/$BANK '{"ifsc_code":"bad"}' "$FARMER"; check "update bank bad IFSC -> 400" 400
req PATCH /api/farmer/bank-accounts/$BANK '{"bank_name":"State Bank"}' "$FARMER"; check "update bank name" 200
req DELETE /api/farmer/bank-accounts/$BANK "" "$FARMER";             check "delete non-primary bank account" 200
req DELETE /api/farmer/bank-accounts/$BANK2 "" "$FARMER2";           check "other farmer's bank account -> 404" 404

req POST /api/farmer/upi '{"upi_id":"ravi@okhdfc"}' "$FARMER";       check "add UPI" 201; UPI=$(j .data.id)
req POST /api/farmer/upi '{"upi_id":"ravi@okhdfc"}' "$FARMER";       check "duplicate UPI -> 409" 409
req POST /api/farmer/upi '{"upi_id":"nope"}' "$FARMER";              check "invalid UPI -> 400" 400
req PATCH /api/farmer/upi/$UPI '{"upi_id":"ravi@ybl"}' "$FARMER";    check "update UPI" 200 '.data.upi_id=="ravi@ybl"'
req DELETE /api/farmer/upi/$UPI "" "$FARMER";                        check "delete UPI" 200

# ═════════════════════════════════════════════ orders (create)
section "Orders: create and list"
req GET /order/crops/list "" "$FARMER";                              check "crop list" 200
req GET /order/statuses "" "$FARMER";                                check "order statuses" 200
req POST /order/drone-availability "{\"state\":$STATE,\"district\":$DISTRICT,\"block\":$BLOCK,\"start_date\":\"$(day 3)\",\"land_in_acers\":4}" "$FARMER"; check "drone availability" 200
req POST /order/create-order "{\"start_date\":\"2020-01-01\",\"crop_type_id\":\"x\",\"land_in_acers\":1000000}" "$FARMER"; check "create-order invalid -> 400 with field errors" 400 '(.errors|length) >= 4'
req POST /order/create-order "{\"start_date\":\"$(day 3)\",\"crop_type_id\":$CROP,\"land_in_acers\":2,\"address\":{\"state\":$STATE,\"district\":$OTHER_DISTRICT,\"block\":$BLOCK}}" "$FARMER"; check "create-order district not in state -> 400" 400
req POST /order/create-order "{\"start_date\":\"$(day 3)\",\"crop_type_id\":999999,\"land_in_acers\":2,\"address\":$ADDR}" "$FARMER"; check "create-order unknown crop -> 400" 400
# exactly what the farmer app sends (client price fields and user_id are ignored for a farmer)
req POST /order/create-order "{\"start_date\":\"$TODAY\",\"crop_type_id\":$CROP,\"land_in_acers\":3.5,\"price\":1,\"tax\":0,\"total_price\":1,\"discount\":0,\"user_id\":$FARMER2_ID,\"farmer_details\":{\"name\":\"x\",\"mobile\":\"$F2MOB\",\"email\":\"\"},\"address\":{\"state\":$STATE,\"district\":$DISTRICT,\"block\":$BLOCK,\"village\":\"Wagholi\",\"address1\":\"Plot 7\",\"address2\":null,\"pincode\":null}}" "$FARMER"
check "create-order (farmer app payload)" 201 '.order_status=="WAITING_FOR_CONFIRMATION" and .otp_required==false and .total_price > 1'
BOOKING=$(j .booking_id)
req POST /order/create-order "{\"start_date\":\"$(day 5)\",\"crop_type_id\":$CROP,\"land_in_acers\":1,\"address\":$ADDR}" "$FARMER"; check "second order (to cancel)" 201; BOOKING2=$(j .booking_id)
req POST /order/create-order "{\"start_date\":\"$(day 6)\",\"crop_type_id\":$CROP,\"land_in_acers\":1,\"address\":$ADDR}" "$FARMER"; check "third order (to reschedule)" 201; BOOKING3=$(j .booking_id)
OWNER=$(PGPASSWORD=testpass psql -h 127.0.0.1 -p 55432 -U postgres -d darhub_test -At -c "SELECT user_id||'/'||to_char(created_on AT TIME ZONE 'UTC','YYYY-MM-DD HH24')||'/'||to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24') FROM \"SPRAYING_ORDER\" WHERE booking_id='$BOOKING'")
STATUS=200; BODY="\"$OWNER\""; check "order belongs to the caller, created_on is the real time ($OWNER)" 200 "(split(\"/\") as \$p | \$p[0]==\"$FARMER_ID\" and \$p[1]==\$p[2])"

req POST /order/filterOrder '{"user_id":1}' "$FARMER";               check "filterOrder (farmer scoped to own)" 200 '.total==3'
req POST /order/filterOrder '{"page":1,"pageSize":2,"orderBy":"DROP TABLE"}' "$FARMER"; check "filterOrder paging + bad orderBy ignored" 200 '(.orders|length)==2 and .totalPages==2'
req GET /order/getOrderByUserId/$FARMER_ID "" "$FARMER";            check "getOrderByUserId self" 200
req GET /order/getOrderByUserId/$FARMER2_ID "" "$FARMER";           check "getOrderByUserId other user -> 403" 403

# ═════════════════════════════════════════════ farmer bookings
section "Farmer bookings"
req GET /api/farmer/bookings/statuses "" "$FARMER";                  check "booking statuses" 200
req GET "/api/farmer/bookings?limit=5000&page=abc" "" "$FARMER";     check "bookings list (limit capped)" 200 '.limit==50 and .total==3'
req GET "/api/farmer/bookings?status=pending" "" "$FARMER";          check "bookings filtered PENDING" 200 '.total==3 and all(.data[]; .status=="PENDING")'
req GET "/api/farmer/bookings" "" "$FARMER2";                        check "other farmer sees none of them" 200 '.total==0'
req GET /api/farmer/bookings/$BOOKING "" "$FARMER";                  check "booking detail" 200 ".data.booking_id==\"$BOOKING\""
req GET /api/farmer/bookings/$BOOKING "" "$FARMER2";                 check "other farmer's booking -> 404" 404
req GET /api/farmer/bookings/not-a-uuid "" "$FARMER";                check "booking id not UUID -> 400" 400
req PATCH /api/farmer/bookings/$BOOKING/rate '{"rating":5}' "$FARMER"; check "rate before completion -> 400" 400
req PATCH /api/farmer/bookings/$BOOKING/rate '{"rating":3.5}' "$FARMER"; check "rate 3.5 -> 400" 400
req PATCH /api/farmer/bookings/$BOOKING3/reschedule '{"new_date":"2001-01-01"}' "$FARMER"; check "reschedule into the past -> 400" 400
req PATCH /api/farmer/bookings/$BOOKING3/reschedule "{\"new_date\":\"$(day 10)\",\"new_time_window\":\"10:00 AM - 12:00 PM\"}" "$FARMER"; check "reschedule" 200 ".data.start_date==\"$(day 10)\""
req POST /api/farmer/bookings/$BOOKING2/cancel '{"cancellation_reason":"Bad weather"}' "$FARMER2"; check "other farmer cannot cancel -> 404" 404
req POST /api/farmer/bookings/$BOOKING2/cancel '{"cancellation_reason":"Bad weather"}' "$FARMER"; check "cancel booking" 200
req POST /api/farmer/bookings/$BOOKING2/cancel '{}' "$FARMER";       check "cancel again -> 400" 400
req GET /api/farmer/bookings/$BOOKING2 "" "$FARMER";                 check "cancelled booking shows reason" 200 '.data.status=="CANCELLED"'

# ═════════════════════════════════════════════ role separation
section "Who may call what"
req GET /api/pilot/work/assignments "" "$FARMER";                    check "farmer on pilot endpoint -> 403" 403
req GET "/api/farmer/profile?tab=main" "" "$ADMIN";                  check "admin on farmer endpoint -> 403" 403
req GET /order/get-order "" "$FARMER";                               check "farmer on admin order list -> 401/403" 401
req PATCH /api/farmer/bookings/$BOOKING/extras '{"service_title":"x"}' "$FARMER"; check "farmer on admin extras -> 401" 401

# ═════════════════════════════════════════════ pilot registration + work
section "Pilot registration"
req POST /api/otp/send-otp "{\"email\":\"$PEMAIL\",\"mobile_number\":\"$PMOB\"}"; PE=$(j .dev_otps.email_otp); PM=$(j .dev_otps.mobile_otp)
req POST /api/otp/verify-otp "{\"email\":\"$PEMAIL\",\"mobile_number\":\"$PMOB\",\"email_otp\":\"$PE\",\"mobile_otp\":\"$PM\"}"; check "pilot otp verified" 200
form POST /api/user/pilot-registration "" -F first_name=Arjun -F last_name=Singh -F email=$PEMAIL -F mobile_number=$PMOB -F password=$PASSWD -F aadhar_number=1234
check "pilot: bad aadhaar -> 400" 400
form POST /api/user/pilot-registration "" -F first_name=Arjun -F last_name=Singh -F email=$PEMAIL -F mobile_number=$PMOB -F password=$PASSWD -F ifsc_code=X -F bank_name=SBI -F acc_number=1
check "pilot: incomplete bank details -> 400" 400
form POST /api/user/pilot-registration "" -F first_name=Arjun -F last_name=Singh$RUN -F email=$PEMAIL -F mobile_number=$PMOB -F password=$PASSWD \
  -F "aadhar_number=2345 6789 0123" -F pan_card_number=abcde1234f -F upi_id=arjun@ybl -F bank_name=SBI -F acc_holder_name=Arjun -F acc_number=123456789 -F ifsc_code=SBIN0001234 -F "address=$ADDR"
check "register pilot" 201; PILOT=$(j .token); PILOT_ID=$(j .user_id)
for tab in main personal address bank documents; do req GET "/api/user/pilot/profile?tab=$tab" "" "$PILOT"; check "pilot profile tab=$tab" 200; done
req GET /api/pilot/work/assignments "" "$PILOT";                     check "pilot assignments (empty)" 200
req GET "/api/farmer/bookings" "" "$PILOT";                          check "pilot on farmer endpoint -> 403" 403

section "Work: assign, accept, start, update, end, rate"
FREE_DRONE=$(PGPASSWORD=testpass psql -h 127.0.0.1 -p 55432 -U postgres -d darhub_test -At -c "SELECT d.id FROM \"DRONE\" d WHERE NOT EXISTS (SELECT 1 FROM \"SPRAYING_DAILY_LOGS\" l WHERE l.drone_id=d.id AND l.working_date='$TODAY' AND l.is_active) ORDER BY d.id LIMIT 1")
req POST /order/assign-work/$BOOKING "{\"pilot\":$PILOT_ID,\"drone_id\":$DRONE,\"working_date\":[\"$TODAY\"]}" "$ADMIN"; [ "$DRONE" != "$FREE_DRONE" ] && check "assigning a drone already busy today -> 409" 409
req POST /order/assign-work/$BOOKING "{\"pilot\":$PILOT_ID,\"drone_id\":$FREE_DRONE,\"working_date\":[\"$TODAY\"]}" "$ADMIN"; check "admin assigns today's work" 200
req POST /order/calendar-availability "{\"booking_id\":\"$BOOKING\"}" "$ADMIN"; check "calendar availability" 200
req GET /api/pilot/work/assignments "" "$PILOT";                     check "pilot sees the assignment" 200
req GET /api/pilot/work/assignments/$BOOKING "" "$PILOT";            check "assignment detail" 200
req POST /api/pilot/work/confirm-assignment "{\"booking_id\":\"$BOOKING\",\"accept_all\":true}" "$PILOT"; check "pilot accepts" 200
req POST /api/pilot/work/start-day "{\"booking_id\":\"$BOOKING\",\"working_date\":\"$TODAY\"}" "$PILOT"; check "start day" 201
req POST /api/pilot/work/update-work "{\"booking_id\":\"$BOOKING\",\"working_date\":\"$TODAY\",\"completed_acres\":2,\"fertilizer_used\":\"Urea 5kg\"}" "$PILOT"; check "update work" 200
LOG_ID=$(PGPASSWORD=testpass psql -h 127.0.0.1 -p 55432 -U postgres -d darhub_test -At -c "SELECT id FROM \"SPRAYING_DAILY_LOGS\" WHERE spraying_work_id='$BOOKING' AND is_active LIMIT 1")
req POST /api/pilot/work/add-comment "{\"booking_id\":\"$BOOKING\",\"comment\":\"Field was wet\"}" "$PILOT"; check "pilot comment" 201
req GET /api/farmer/bookings/$BOOKING "" "$FARMER";                  check "farmer sees the job ongoing" 200 '.data.status=="ONGOING"'
req POST /api/pilot/work/end-day "{\"booking_id\":\"$BOOKING\",\"working_date\":\"$TODAY\",\"completed_acres\":3.5}" "$PILOT"; check "end day -> order completed" 200
req GET /api/farmer/bookings/$BOOKING "" "$FARMER";                  check "farmer sees COMPLETED" 200 '.data.status=="COMPLETED"'
req PATCH /api/farmer/bookings/$BOOKING/rate '{"rating":5}' "$FARMER"; check "farmer rates completed booking" 200
req POST /order/update-work/$LOG_ID "" "$ADMIN";                     check "admin field verification" 200

# ═════════════════════════════════════════════ profile edit endpoints
section "farmer-edit / pilot-edit"
form PUT /api/user/farmer-edit "$FARMER" -F user_id=$FARMER_ID -F first_name=Ravi -F last_name=Kumar
check "farmer-edit own profile with own user_id as text" 200
form PUT /api/user/farmer-edit "$FARMER" -F user_id=$FARMER2_ID -F first_name=Hack
check "farmer-edit someone else -> 403" 403
form PUT /api/user/farmer-edit "$FARMER" -F password=NewPass@123
check "farmer-edit password without current -> 400" 400
form PUT /api/user/farmer-edit "$FARMER" -F password=NewPass@123 -F current_password=$PASSWD
check "farmer-edit password with current" 200
req POST /api/login "{\"identifier\":\"$FMOB\",\"password\":\"NewPass@123\"}"; check "login with new password" 200
req POST /api/refresh-token "" "$NEW_REFRESH";                       check "refresh token from before the password change -> 401" 401
form PUT /api/user/farmer-edit "$FARMER" -F dob=99/99/2000
check "farmer-edit bad dob -> 400" 400
form PUT /api/user/pilot-edit "$PILOT" -F first_name=Arjun -F upi_id=arjun2@ybl -F "address=$ADDR"
check "pilot-edit" 200
form PUT /api/user/pilot-edit "$PILOT" -F "aaddhar_image=@$TXT;type=text/plain"
check "pilot-edit text file as document -> 400" 400
form PUT /api/user/pilot-edit "$FARMER" -F first_name=X
check "pilot-edit on a farmer account -> 400" 400

# ═════════════════════════════════════════════ admin views
section "Admin views of the same data"
req GET /order/get-order "" "$ADMIN";                                check "admin order list" 200
req GET /order/getOrderById/$BOOKING "" "$ADMIN";                    check "admin order by id" 200
req POST /order/filter-orders '{"order_status":"complet","page":1,"pageSize":10}' "$ADMIN"; check "admin filter by status" 200 '.total>=1 and all(.orders[]; .order_status|test("COMPLET"))'
req POST /order/filter-orders "{\"user_id\":$FARMER_ID}" "$ADMIN";   check "admin filter by user" 200 '.total==3'
req POST /order/filter-orders "{\"pilot_name\":\"arjun singh$RUN\"}" "$ADMIN"; check "admin filter by pilot name" 200 '.total==1 and (.orders[0].daily_logs[0].pilot_name|test("Arjun"))'
req POST /order/filter-orders "{\"state\":\"zzzz-no-such-state\"}" "$ADMIN"; check "admin filter unknown state -> empty" 200 '.total==0'
req PATCH /api/farmer/bookings/$BOOKING/extras '{"service_title":"Wheat spraying"}' "$ADMIN"; check "admin extras (needs permission)" 200
req POST /api/filter '{}' "$ADMIN";                                  check "admin users filter" 200
req GET /api/users/booking-list "" "$ADMIN";                         check "admin users booking-list" 200
req GET /api/get-user/$FARMER_ID "" "$ADMIN";                        check "admin get user" 200
req GET /api/get-user/$FARMER_ID "" "$FARMER";                       check "farmer get own user" 200
req GET /api/get-user/$FARMER2_ID "" "$FARMER";                      check "farmer get other user -> 403" 403
