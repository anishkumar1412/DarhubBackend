#!/usr/bin/env python3
"""Writes routes.txt (METHOD /full/path file) by reading routes/*.js and the mount prefixes used in app.js."""
import re, os
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.join(here, '..', '..', 'routes') + '/'
mounts = {
 'user.routes.js':['/api'], 'locationRoutes.js':['/api/locations'], 'pilotWork.routes.js':['/api/pilot/work'],
 'orderRoutes.js':['/order'], 'cropRoutes.js':['/crops'], 'workingDaysRoutes.js':['/working-days'],
 'fertilizerRoutes.js':['/api/fertilizers'], 'warehouseRoutes.js':['/api/warehouses'], 'adminAuthRoutes.js':['/admin/auth'],
 'adminAccountRoutes.js':['/admin/account'], 'rolesRoutes.js':['/admin/roles'], 'privilegesRoutes.js':['/admin/privileges'],
 'rolePrivilegesRoutes.js':['/admin/role-privileges'], 'userRolesRoutes.js':['/admin/user-roles'],
 'inventoryRoutes.js':['/api/inventory'], 'droneStatus.routes.js':['/api/inventory'], 'adminRoutes.js':['/admin'],
 'pilotMaintenanceRoutes.js':['/api/pilot/maintenance'], 'vendorRoutes.js':['/api/vendors'], 'farmerRoutes.js':['/api/farmer'],
}
seen = set(); out = []
for f, prefixes in mounts.items():
    s = open(root + f).read()
    s = re.sub(r'//[^\n]*', '', s); s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    for m in re.finditer(r'\b\w+\.(get|post|put|patch|delete)\(\s*\n?\s*["\']([^"\']+)["\']', s):
        for p in prefixes:
            key = (m.group(1).upper(), p + m.group(2))
            if key not in seen:
                seen.add(key); out.append(f"{key[0]} {key[1]} {f}")
open(os.path.join(here, 'routes.txt'), 'w').write('\n'.join(out) + '\n')
print(len(out), 'routes')
