INSERT INTO "User" (id, "externalId", name, password, role, company, division, department, "noShowCount", "isActive", "createdAt", "updatedAt") 
VALUES (
    gen_random_uuid(), 
    '000406', 
    'User No Show', 
    '$2b$10$rQZ6v7Zl7GnQyjSxHq0Yy.JqY6YQH9nZ3q7jNxZj6qw7FmVz5hL6m', 
    'USER',
    'SJA',
    'Operations',
    'General', 
    2, 
    true, 
    NOW(), 
    NOW()
) ON CONFLICT ("externalId") DO UPDATE SET "noShowCount" = 2, name = 'User No Show', company = 'SJA', division = 'Operations', department = 'General';
