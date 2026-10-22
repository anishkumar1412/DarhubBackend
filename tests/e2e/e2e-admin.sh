# Admin back-office CRUD (sourced by e2e.sh after e2e-cases.sh; uses $ADMIN, $RUN, $STATE, $DISTRICT, $BLOCK)
section "Admin: crops"
form POST /crops/create "$ADMIN" -F "name=TestCrop$RUN" -F desc=Test -F price_per_acre=1200;  check "create crop" 201; CROP_NEW=$(j '.data.id // .id // .crop.id')
req POST /crops/filter '{"page":1,"pageSize":5}' "$ADMIN";            check "filter crops" 200
req GET /crops/$CROP_NEW "" "$ADMIN";                                  check "get crop" 200
form PUT /crops/update/$CROP_NEW "$ADMIN" -F price_per_acre=1500;      check "update crop" 200
req DELETE /crops/$CROP_NEW "" "$ADMIN";                               check "delete crop" 200
req GET /crops/abc "" "$ADMIN";                                        check "crop id not numeric -> 400" 400

section "Admin: working days"
req POST /working-days/create '{"min_acre":5000,"max_acre":5001,"working_days":60}' "$ADMIN"; check "create working-days rule" 201; WD=$(j '.data.id // .id')
req GET /working-days/list "" "$ADMIN";                                check "list working days" 200
req POST /working-days/filter '{}' "$ADMIN";                           check "filter working days" 200
req PUT /working-days/update/$WD '{"working_days":59}' "$ADMIN";        check "update working days" 200
req DELETE /working-days/$WD "" "$ADMIN";                              check "delete working days" 200

section "Admin: fertilizers"
form POST /api/fertilizers/ "$ADMIN" -F "name=Urea$RUN" -F type=Chemical -F company=IFFCO -F packageType=Bag -F quantity=10 -F unit=kg -F price=250
check "create fertilizer" 201; FERT=$(j '.data.id // .id')
req POST /api/fertilizers/filter '{"page":1,"pageSize":5}' "$ADMIN";   check "filter fertilizers" 200
req GET /api/fertilizers/$FERT "" "$ADMIN";                            check "get fertilizer" 200
form PUT /api/fertilizers/$FERT "$ADMIN" -F price=275;                 check "update fertilizer" 200
req DELETE /api/fertilizers/$FERT "" "$ADMIN";                         check "delete fertilizer" 200

section "Admin: warehouses"
req POST /api/warehouses/ "{\"warehouse_name\":\"WH $RUN\",\"warehouse_code\":\"WH$RUN\",\"type\":\"Owned\",\"warehouse_category\":\"General\",\"capacity\":100,\"status\":\"Active\",\"address_line_1\":\"Road 1\",\"state\":$STATE,\"district\":$DISTRICT,\"city_location\":\"Pune\",\"pincode\":\"411001\",\"manager_name\":\"M\",\"manager_mobile\":\"9876543210\",\"manager_email\":\"m@example.com\"}" "$ADMIN"
check "create warehouse" 201; WH=$(j '.data.id // .id')
req POST /api/warehouses/ '{}' "$ADMIN";                               check "create warehouse empty -> 400" 400
req POST /api/warehouses/filter '{}' "$ADMIN";                         check "filter warehouses" 200
req GET /api/warehouses/$WH "" "$ADMIN";                               check "get warehouse" 200
req PUT /api/warehouses/$WH '{"capacity":150}' "$ADMIN";               check "update warehouse" 200
req DELETE /api/warehouses/$WH "" "$ADMIN";                            check "delete warehouse" 200

section "Admin: roles, privileges, assignments"
req POST /admin/roles/ "{\"role_name\":\"tester_$RUN\",\"role_desc\":\"Test role\"}" "$ADMIN"; check "create role" 201; ROLE=$(j '.data.id // .id // .role.id')
req GET /admin/roles/ "" "$ADMIN";                                     check "list roles" 200
req PUT /admin/roles/$ROLE '{"role_desc":"Updated"}' "$ADMIN";         check "update role" 200
req POST /admin/privileges/ "{\"privilage_name\":\"test:priv$RUN\",\"privilage_desc\":\"x\"}" "$ADMIN"; check "create privilege" 201; PRIV=$(j '.data.id // .id // .privilege.id')
req POST /admin/role-privileges/$ROLE/assign "{\"privilage_id\":$PRIV}" "$ADMIN"; check "assign privilege to role" 201
req GET /admin/role-privileges/$ROLE "" "$ADMIN";                      check "role privileges" 200
req DELETE /admin/privileges/$PRIV "" "$ADMIN";                        check "delete privilege still assigned -> 409" 409
req POST /admin/role-privileges/$ROLE/sync "{\"privilage_ids\":[$PRIV]}" "$ADMIN"; check "sync role privileges" 200
req DELETE /admin/role-privileges/$ROLE/$PRIV "" "$ADMIN";             check "remove privilege from role" 200
req DELETE /admin/privileges/$PRIV "" "$ADMIN";                        check "delete privilege" 200
req DELETE /admin/roles/$ROLE "" "$ADMIN";                             check "delete role" 200

section "Admin: admins"
SUPER_ROLE=$(PGPASSWORD=testpass psql -h 127.0.0.1 -p 55432 -U postgres -d darhub_test -At -c "SELECT id FROM \"MASTER_ROLE\" WHERE role_name='manager' LIMIT 1")
req POST /admin/auth/create-admin "{\"full_name\":\"Ops $RUN\",\"email\":\"ops$RUN@example.com\",\"role_id\":$SUPER_ROLE}" "$ADMIN"; check "create admin (invite)" 201
req GET /admin/account/admins "" "$ADMIN";                             check "list admins" 200
req PUT /admin/account/profile '{"full_name":"Test Super Admin"}' "$ADMIN"; check "update own admin profile" 200
req POST /admin/account/change-password '{"current_password":"wrong","new_password":"Admin@12345","confirm_password":"Admin@12345"}' "$ADMIN"; check "change password wrong current -> 401" 401
req POST /admin/auth/forgot-password '{"email":"superadmin@example.com"}'; check "forgot password (always 200)" 200

section "Admin: inventory"
req POST /api/inventory/drones "{\"drone_code\":\"DR$RUN\",\"drone_type\":\"Agri 10L\",\"location\":\"Pune\",\"status\":\"Active\"}" "$ADMIN"; check "create inventory drone" 201; IDR=$(j '.data.id // .id')
req GET "/api/inventory/drones?limit=5" "" "$ADMIN";                   check "list inventory drones" 200
req PUT /api/inventory/drones/$IDR '{"status":"Maintenance"}' "$ADMIN"; check "update inventory drone" 200
req DELETE /api/inventory/drones/$IDR "" "$ADMIN";                     check "delete inventory drone" 200
req POST /api/inventory/accessories "{\"sku\":\"ACC$RUN\",\"name\":\"Battery\",\"quantity\":5,\"min_stock\":1,\"status\":\"In Stock\",\"unit_price\":100}" "$ADMIN"; check "create accessory" 201; ACC=$(j '.data.id // .id')
req PUT /api/inventory/accessories/$ACC '{"quantity":7}' "$ADMIN";     check "update accessory" 200
req DELETE /api/inventory/accessories/$ACC "" "$ADMIN";                check "delete accessory" 200
req GET /api/inventory/dashboard/stats "" "$ADMIN";                    check "inventory dashboard" 200
req POST /api/inventory/vendors '{}' "$ADMIN";                         check "create vendor without fields -> 400" 400

section "Admin: comments, users"
req POST /admin/create-comment "{\"comment\":\"Checked field\",\"booking_id\":\"$BOOKING\",\"comment_type\":1}" "$ADMIN"; check "create order comment" 201
req POST /admin/filter-comments "{\"booking_id\":\"$BOOKING\"}" "$ADMIN"; check "filter comments" 200
req POST /api/users/by-role "{\"role_id\":$SUPER_ROLE}" "$ADMIN";      check "users by role" 200
req POST /api/users/addresses "{\"user_id\":$FARMER_ID}" "$ADMIN";     check "user addresses" 200
req GET "/api/users/search?email=new$RUN@example.com" "" "$ADMIN";     check "user search by email" 200
