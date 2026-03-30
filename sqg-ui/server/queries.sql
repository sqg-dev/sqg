-- MIGRATE 1
-- Create the users table (SQG Example - https://sqg.dev/guides/sql-syntax/)
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- MIGRATE 2
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  content TEXT,
  published INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- TESTDATA seed_data
INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com');
INSERT INTO users (name, email) VALUES ('Bob', 'bob@example.com');
INSERT INTO posts (user_id, title, content, published) VALUES (1, 'Hello World', 'My first post!', 1);

-- QUERY list_users
SELECT id, name, email, created_at
FROM users
ORDER BY created_at DESC;

-- QUERY get_user_by_id :one
@set id = 1
SELECT id, name, email, created_at
FROM users
WHERE id = ${id};

-- QUERY get_user_by_email :one
@set email = 'alice@example.com'
SELECT id, name, email, created_at
FROM users
WHERE email = ${email};

-- QUERY count_users :one :pluck
SELECT COUNT(*) FROM users;

-- QUERY list_posts_by_user
@set user_id = 1
SELECT p.id, p.title, p.content, p.published, p.created_at
FROM posts p
WHERE p.user_id = ${user_id}
ORDER BY p.created_at DESC;

-- QUERY list_published_posts
SELECT
  p.id,
  p.title,
  p.content,
  p.created_at,
  u.name as author_name,
  u.email as author_email
FROM posts p
JOIN users u ON p.user_id = u.id
WHERE p.published = 1
ORDER BY p.created_at DESC;

-- EXEC create_user
@set name = 'New User'
@set email = 'new@example.com'
INSERT INTO users (name, email)
VALUES (${name}, ${email});

-- EXEC create_post
@set user_id = 1
@set title = 'New Post'
@set content = 'Post content here'
INSERT INTO posts (user_id, title, content)
VALUES (${user_id}, ${title}, ${content});

-- EXEC publish_post
@set id = 1
UPDATE posts SET published = 1 WHERE id = ${id};

-- EXEC delete_post
@set id = 1
DELETE FROM posts WHERE id = ${id};
