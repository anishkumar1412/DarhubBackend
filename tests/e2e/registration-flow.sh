#!/usr/bin/env bash
# Registration scenarios against the local test server (port 5799)
B=http://localhost:5799; RUN=$(date +%s); H="X-Forwarded-For: 10.5.$((RUN%250)).$((RANDOM%250))"
export PGPASSWORD=testpass; Q="psql -h 127.0.0.1 -p 55432 -U postgres -d darhub_test -At"
PASS=0; FAIL=0
j(){ curl -s -H "$H" -H 'Content-Type: application/json' "$@"; }
check(){ if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "PASS  $1"; else FAIL=$((FAIL+1)); echo "FAIL  $1 -> got [$2] want [$3]"; fi; }
mob(){ printf "98%08d" $(( (RUN*13 + $1) % 100000000 )); }
reg(){ # email mobile -> HTTP body (multipart, like the apps)
  curl -s -H "$H" -F first_name=Test -F last_name=Person -F "email=$1" -F "mobile_number=$2" -F password='Secret@123' \
   -F "address=[{\"state\":$ST,\"district\":$DI,\"block\":$BL,\"village\":\"Moraiya\",\"pincode\":\"382110\"}]" $B/api/user/farmer-registration; }
read ST DI BL < <($Q -F' ' -c "select state,district,block from \"USER_ADDRESS\" where is_primary limit 1")
sendverify(){ # email mobile -> prints verify http result
  local r=$(j -d "{\"email\":\"$1\",\"mobile_number\":\"$2\"}" $B/api/otp/send-otp); echo "$r" > $S_OUT
  local eo=$(echo "$r" | jq -r .dev_otps.email_otp) mo=$(echo "$r" | jq -r .dev_otps.mobile_otp)
  j -d "{\"email\":\"$1\",\"mobile_number\":\"$2\",\"email_otp\":\"$eo\",\"mobile_otp\":\"$mo\"}" $B/api/otp/verify-otp | jq -r .success; }
S_OUT=$(mktemp)   # needs the local test server: bash tests/e2e/restart.sh

echo "=== S1: verify the OTP, 'kill the app', start again"
E1="s1.$RUN@example.com"; M1=$(mob 1)
check "first attempt: OTP verified" "$(sendverify $E1 $M1)" true
R=$(j -d "{\"email\":\"$E1\",\"mobile_number\":\"$M1\"}" $B/api/otp/send-otp)
check "  second send-otp right after: asked to wait, NOT 'user already exists'" "$(echo "$R" | jq -r .code)" OTP_COOLDOWN
sleep 11
R=$(sendverify $E1 $M1) ; check "  after the wait: a new code is sent and verified again" "$R" true
check "  registers fine" "$(reg $E1 $M1 | jq -r .success)" true
check "  exactly one account" "$($Q -c "select count(*) from \"USER\" where lower(email)='$E1'")" 1

echo "=== S2: a placeholder made by an admin is claimed by its real owner"
ADM=$(j -d '{"email":"superadmin@example.com","password":"Admin@12345"}' $B/admin/auth/login | jq -r .data.token)
M2=$(mob 2); E2="s2.$RUN@example.com"; CROP=$($Q -c 'select id from "MASTER_CROP" order by id limit 1')
D=$(TZ=Asia/Kolkata date -d "+3 day" +%F)
BK=$(j -H "Authorization: Bearer $ADM" -d "{\"start_date\":\"$D\",\"crop_type_id\":$CROP,\"land_in_acers\":2,\"farmer_details\":{\"name\":\"Walk In\",\"mobile\":\"$M2\"},\"address\":{\"state\":$ST,\"district\":$DI,\"block\":$BL,\"village\":\"Moraiya\"}}" $B/order/create-order | jq -r .booking_id)
PID=$($Q -c "select id from \"USER\" where mobile_number='$M2'")
check "  admin booking created a placeholder account" "$([ -n "$PID" ] && echo yes)" yes
R=$(j -d "{\"email\":\"$E2\",\"mobile_number\":\"$M2\"}" $B/api/otp/send-otp)
check "  the real owner CAN get an OTP (used to be 'User already exists')" "$(echo "$R" | jq -r .success)" true
eo=$(echo "$R" | jq -r .dev_otps.email_otp); mo=$(echo "$R" | jq -r .dev_otps.mobile_otp)
j -d "{\"email\":\"$E2\",\"mobile_number\":\"$M2\",\"email_otp\":\"$eo\",\"mobile_otp\":\"$mo\"}" $B/api/otp/verify-otp >/dev/null
RG=$(reg $E2 $M2)
check "  registers (201 body success)" "$(echo "$RG" | jq -r .success)" true
check "  ...and is told their bookings were linked" "$(echo "$RG" | jq -r .linked_existing_bookings)" true
check "  same account id (nothing duplicated)" "$(echo "$RG" | jq -r .user_id)" "$PID"
check "  one account for that mobile" "$($Q -c "select count(*) from \"USER\" where mobile_number='$M2'")" 1
T=$(j -d "{\"identifier\":\"$M2\",\"password\":\"Secret@123\"}" $B/api/login | jq -r .token)
check "  can log in with the password they chose" "$([ "$T" != null ] && echo yes)" yes
check "  sees the booking the admin made for them" "$(j -H "Authorization: Bearer $T" "$B/api/farmer/bookings" | jq -r "[.data[].booking_id]|index(\"$BK\")!=null")" true
check "  has the farmer role" "$($Q -c "select count(*) from \"USER_ROLE\" ur join \"MASTER_ROLE\" r on r.id=ur.role_id where ur.user_id=$PID and r.role_name ilike 'farmer'")" 1

echo "=== S3: now it is a real account, nobody else can take it"
sleep 11
R=$(j -d "{\"email\":\"other.$RUN@example.com\",\"mobile_number\":\"$M2\"}" $B/api/otp/send-otp)
check "  409 ALREADY_EXISTS" "$(echo "$R" | jq -r .code)" ALREADY_EXISTS
check "  names the field" "$(echo "$R" | jq -r .field)" mobile
check "  says to log in" "$(echo "$R" | jq -r '.message|test("log in")')" true

echo "=== S4: claiming a placeholder needs the OTP for the matching detail"
M4=$(mob 4); E4="s4.$RUN@example.com"
j -H "Authorization: Bearer $ADM" -d "{\"start_date\":\"$D\",\"crop_type_id\":$CROP,\"land_in_acers\":2,\"farmer_details\":{\"name\":\"Walk In 2\",\"mobile\":\"$M4\"},\"address\":{\"state\":$ST,\"district\":$DI,\"block\":$BL,\"village\":\"Moraiya\"}}" $B/order/create-order >/dev/null
R=$(j -d "{\"email\":\"$E4\",\"mobile_number\":\"$M4\"}" $B/api/otp/send-otp); eo=$(echo "$R" | jq -r .dev_otps.email_otp)
j -d "{\"email\":\"$E4\",\"email_otp\":\"$eo\"}" $B/api/otp/verify-otp >/dev/null      # e-mail only: the mobile is NOT proven
RG=$(reg $E4 $M4)
check "  refused: CLAIM_NEEDS_VERIFICATION" "$(echo "$RG" | jq -r .code)" CLAIM_NEEDS_VERIFICATION
check "  placeholder untouched (still no password change / not verified)" "$($Q -c "select \"isMobileVerify\" from \"USER\" where mobile_number='$M4'")" f

echo "=== S5: a real farmer's number cannot be registered again"
sleep 11
R=$(j -d "{\"email\":\"$E1\",\"mobile_number\":\"$(mob 9)\"}" $B/api/otp/send-otp)
check "  e-mail already registered -> ALREADY_EXISTS on email" "$(echo "$R" | jq -r '.code+":"+.field')" ALREADY_EXISTS:email

echo "=== S6: admin booking finds a farmer stored with the old '0' spelling"
M6=$(mob 6); $Q -c "insert into \"USER\"(email,password,username,mobile_number,user_type,\"isEmailVerify\",\"isMobileVerify\",is_active,created_on,created_by,\"createdAt\",\"updatedAt\") values ('legacy.$RUN@example.com','x','legacy','0$M6',3,true,true,true,now(),1,now(),now())" >/dev/null
j -H "Authorization: Bearer $ADM" -d "{\"start_date\":\"$D\",\"crop_type_id\":$CROP,\"land_in_acers\":2,\"farmer_details\":{\"name\":\"Legacy\",\"mobile\":\"$M6\"},\"address\":{\"state\":$ST,\"district\":$DI,\"block\":$BL,\"village\":\"Moraiya\"}}" $B/order/create-order >/dev/null
check "  no second account was created" "$($Q -c "select count(*) from \"USER\" where mobile_number in ('$M6','0$M6')")" 1
echo; echo "PASSED $PASS  FAILED $FAIL"
