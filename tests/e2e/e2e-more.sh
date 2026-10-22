# Remaining flows (sourced after e2e-admin.sh)
section "Admin books for a farmer (order OTP)"
req POST /order/create-order "{\"start_date\":\"$(day 4)\",\"crop_type_id\":$CROP,\"land_in_acers\":2,\"user_id\":$FARMER2_ID,\"price\":5000,\"tax\":250,\"discount\":100,\"address\":$ADDR}" "$ADMIN"
check "admin creates order for an existing farmer (client price honoured)" 201 '.otp_required==true and .dev_otp != null and .total_price==5150'
ADM_BOOKING=$(j .booking_id); ADM_OTP=$(j .dev_otp)
req POST /order/create-order "{\"start_date\":\"$(day 4)\",\"crop_type_id\":$CROP,\"land_in_acers\":2,\"address\":$ADDR,\"discount\":999999}" "$ADMIN"; check "admin order with neither user_id nor farmer -> 400" 400
req POST /order/create-order "{\"start_date\":\"$(day 4)\",\"crop_type_id\":$CROP,\"land_in_acers\":2,\"user_id\":$FARMER2_ID,\"price\":100,\"discount\":999,\"address\":$ADDR}" "$ADMIN"; check "discount above price -> 400" 400
req POST /order/resend-otp "{\"booking_id\":\"$ADM_BOOKING\"}" "$FARMER";   check "another farmer cannot resend the OTP -> 403" 403
req POST /order/resend-otp "{\"booking_id\":\"$ADM_BOOKING\"}" "$FARMER2";  check "farmer resends booking OTP" 200
NEW_OTP=$(j '.dev_otp // empty'); [ -n "$NEW_OTP" ] && ADM_OTP=$NEW_OTP
req POST /order/verify-otp "{\"booking_id\":\"$ADM_BOOKING\",\"otp\":\"000000\"}" "$FARMER2"; check "wrong booking OTP -> 400" 400
req POST /order/verify-otp "{\"booking_id\":\"$ADM_BOOKING\",\"otp\":\"$ADM_OTP\"}" "$FARMER2"; check "farmer confirms booking with OTP" 200
req GET /api/farmer/bookings/$ADM_BOOKING "" "$FARMER2";                    check "booking now pending confirmation" 200 '.data.order_status=="WAITING_FOR_CONFIRMATION"'
NEWMOB=$(mob 9)
req POST /order/create-order "{\"start_date\":\"$(day 4)\",\"crop_type_id\":$CROP,\"land_in_acers\":1,\"farmer_details\":{\"name\":\"Walk-in Farmer\",\"mobile\":\"+91$NEWMOB\"},\"address\":$ADDR}" "$ADMIN"
check "admin books for a farmer without an account (placeholder created)" 201
PLACEHOLDER=$(PGPASSWORD=testpass psql -h 127.0.0.1 -p 55432 -U postgres -d darhub_test -At -c "SELECT user_type||'/'||(password IS NOT NULL) FROM \"USER\" WHERE mobile_number='$NEWMOB'")
STATUS=200; BODY="\"$PLACEHOLDER\""; check "placeholder farmer stored with normalised mobile and an unguessable password ($PLACEHOLDER)" 200 '.=="3/true"'
req POST /api/login "{\"identifier\":\"$NEWMOB\",\"password\":\"12345678\"}";  check "placeholder cannot log in with the old fixed password" 401

section "Admin edits and deletes orders"
req POST /order/updateOrder "{\"booking_id\":\"$ADM_BOOKING\",\"land_in_acers\":3}" "$ADMIN"; check "admin updates order" 200
req POST /order/updateOrder '{}' "$ADMIN";                                  check "updateOrder without booking_id -> 400" 400
req POST /order/updateOrder '{"booking_id":"abc"}' "$ADMIN";               check "updateOrder bad booking_id -> 400" 400
req POST /order/deleteOrder "{\"booking_id\":\"$BOOKING2\"}" "$ADMIN";      check "admin deletes the cancelled order" 200
req GET /api/farmer/bookings/$BOOKING2 "" "$FARMER";                        check "deleted order is gone for the farmer" 404

section "Pilot declines; reschedule after assignment"
req POST /order/assign-work/$BOOKING3 "{\"pilot\":$PILOT_ID,\"drone_id\":$(free_drone "$(day 10)"),\"working_date\":[\"$(day 10)\"]}" "$ADMIN"; check "assign rescheduled booking" 200
req POST /api/pilot/work/reject-assignment "{\"booking_id\":\"$BOOKING3\",\"reason\":\"x\"}" "$PILOT";  check "decline without a real reason -> 400" 400
req POST /api/pilot/work/reject-assignment "{\"booking_id\":\"$BOOKING3\",\"reason\":\"Drone under repair\"}" "$PILOT"; check "pilot declines with a reason" 200
req POST /order/create-order "{\"start_date\":\"$(day 12)\",\"crop_type_id\":$CROP,\"land_in_acers\":1,\"address\":$ADDR}" "$FARMER"; BOOKING4=$(j .booking_id)
req POST /order/assign-work/$BOOKING4 "{\"pilot\":$PILOT_ID,\"drone_id\":$(free_drone "$(day 12)"),\"working_date\":[\"$(day 12)\"]}" "$ADMIN"; check "assign another booking" 200
req POST /api/pilot/work/confirm-assignment "{\"booking_id\":\"$BOOKING4\",\"accept_all\":true}" "$PILOT"; check "pilot accepts it" 200
req GET /api/farmer/bookings/$BOOKING4 "" "$FARMER";                        check "farmer sees UPCOMING" 200 '.data.status=="UPCOMING"'
req PATCH /api/farmer/bookings/$BOOKING4/reschedule "{\"new_date\":\"$(day 14)\"}" "$FARMER"; check "farmer reschedules an accepted booking" 200 '.data.status=="PENDING"'
req GET /api/pilot/work/assignments/$BOOKING4 "" "$PILOT";                  check "pilot no longer assigned after reschedule" 404
req POST /api/pilot/work/start-day "{\"booking_id\":\"$BOOKING4\",\"working_date\":\"$(day 12)\"}" "$PILOT"; check "pilot cannot start the old date" 404

section "Pilot maintenance and drone status"
req POST /api/pilot/maintenance/ "{\"drone_id\":$FREE_DRONE}" "$FARMER";    check "farmer cannot file pilot maintenance -> 403" 403
req POST /api/pilot/maintenance/ '{}' "$PILOT";                             check "maintenance without drone -> 400" 400
req POST /api/pilot/maintenance/ "{\"drone_id\":$FREE_DRONE,\"task_name\":\"Propeller check\"}" "$PILOT"; check "maintenance task with unknown task_name -> 400" 400
req POST /api/pilot/maintenance/ "{\"drone_id\":$FREE_DRONE,\"task_name\":\"Repair\"}" "$PILOT"; check "pilot creates maintenance task" 201; TASK=$(j '.data.id // .id')
req GET "/api/pilot/maintenance/?limit=1000" "" "$PILOT";                   check "pilot lists own tasks" 200 '(.data|length) >= 1'
req GET /api/pilot/maintenance/stats "" "$PILOT";                           check "maintenance stats" 200
req GET /api/pilot/maintenance/$TASK "" "$PILOT";                           check "get maintenance task" 200
req PATCH /api/pilot/maintenance/$TASK/submit '{}' "$PILOT";                check "submitting an already submitted task -> 400" 400
req POST /api/pilot/maintenance/draft "{\"drone_id\":$FREE_DRONE,\"overall_status\":\"Good\"}" "$PILOT";  check "save maintenance draft" 201; DRAFT=$(j '.data.id // .id')
req PATCH /api/pilot/maintenance/$DRAFT/submit '{}' "$PILOT";               check "submit the draft" 200
req DELETE /api/pilot/maintenance/$DRAFT "" "$PILOT";                       check "delete maintenance task" 200
req GET /api/inventory/pilot-maintenance-tasks "" "$ADMIN";                 check "admin sees pilot maintenance tasks" 200
req GET /api/inventory/drone-status/active "" "$ADMIN";                     check "drones active today" 200
req PATCH /api/inventory/drone-status/$FREE_DRONE '{"daily_status":true}' "$ADMIN"; check "toggle drone status" 200

section "Deactivated accounts"
PGPASSWORD=testpass psql -h 127.0.0.1 -p 55432 -U postgres -d darhub_test -qc "UPDATE \"USER\" SET is_active=false WHERE id=$FARMER2_ID"
req GET /api/farmer/bookings "" "$FARMER2";                                 check "deactivated farmer is refused (token still valid)" 401
req POST /api/login "{\"identifier\":\"$F2MOB\",\"password\":\"$PASSWD\"}";  check "deactivated farmer cannot log in" 403
PGPASSWORD=testpass psql -h 127.0.0.1 -p 55432 -U postgres -d darhub_test -qc "UPDATE \"USER\" SET is_active=true WHERE id=$FARMER2_ID"


# ═════════════════════════════════════════════ Locations: official directory + "use my location" matching
section "Locations (LGD directory + GPS match)"
req GET /api/locations/states; check "states list is the national list (30+)" 200 'length >= 30'
STATE_GJ=$(echo "$BODY" | jq -r '[.[] | select(.state_name=="Gujarat")][0].id')
req GET /api/locations/districts/$STATE_GJ; check "Gujarat has 30+ districts" 200 'length >= 30'
req GET "/api/locations/match?state=Gujarat&district=Ahmadabad&places=Sanand"; check "match: spelling variant resolves to our rows" 200 '.complete==true and .district.name=="Ahmedabad" and .block.name=="Sanand"'
req GET "/api/locations/match?state=Gujarat&district=Rajkot&places=Gondal"; check "match: specific place beats the district name" 200 '.block.name=="Gondal"'
req GET "/api/locations/match?state=Atlantis&district=Nowhere"; check "match: unknown place is not guessed" 200 '.complete==false and .state==null'
req GET "/api/locations/match"; check "match: no parameters is an empty answer, not an error" 200 '.complete==false'
req GET "/api/locations/match?state=Gujarat&places=a%7Cb%7Cc%7Cd%7Ce%7Cf%7Cg%7Ch%7Ci"; check "match: more than 8 places -> 400" 400 '.code=="VALIDATION_ERROR"'
req GET "/api/locations/match?state=Gujarat&places=Gondal%7CRajkot"; check "match: only a state reported -> only the state is filled" 200 '.state.name=="Gujarat" and .district==null and .block==null'
req GET "/api/locations/match?state=Gujarat&district=Rajkot"; check "match: no locality -> block is not guessed from the district name" 200 '.district.name=="Rajkot" and .block==null and .complete==false'
