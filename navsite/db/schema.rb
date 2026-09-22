# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_09_21_125231) do
  create_table "active_storage_attachments", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.bigint "record_id", null: false
    t.string "record_type", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.string "content_type"
    t.datetime "created_at", null: false
    t.string "filename", null: false
    t.string "key", null: false
    t.text "metadata"
    t.string "service_name", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "categories", force: :cascade do |t|
    t.boolean "builtin", default: false, null: false
    t.datetime "created_at", null: false
    t.string "icon", default: "fas fa-folder", null: false
    t.string "name", null: false
    t.integer "position", null: false
    t.datetime "updated_at", null: false
    t.index ["position"], name: "index_categories_on_position"
  end

  create_table "secrets", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "note"
    t.text "password"
    t.datetime "updated_at", null: false
    t.text "username"
    t.integer "website_id", null: false
    t.index ["website_id"], name: "index_secrets_on_website_id", unique: true
  end

  create_table "settings", force: :cascade do |t|
    t.string "accent"
    t.text "ai_api_key"
    t.string "ai_base_url", default: "https://api.deepseek.com", null: false
    t.string "ai_model", default: "deepseek-flash", null: false
    t.datetime "created_at", null: false
    t.boolean "sidebar_compact", default: false, null: false
    t.string "theme", default: "light", null: false
    t.datetime "updated_at", null: false
    t.string "vault_password_digest"
  end

  create_table "taggings", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "tag_id", null: false
    t.datetime "updated_at", null: false
    t.integer "website_id", null: false
    t.index ["tag_id", "website_id"], name: "index_taggings_on_tag_id_and_website_id", unique: true
    t.index ["tag_id"], name: "index_taggings_on_tag_id"
    t.index ["website_id"], name: "index_taggings_on_website_id"
  end

  create_table "tags", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_tags_on_name", unique: true
  end

  create_table "websites", force: :cascade do |t|
    t.integer "category_id", null: false
    t.integer "clicks_count", default: 0, null: false
    t.datetime "created_at", null: false
    t.text "description"
    t.boolean "hidden", default: false, null: false
    t.string "icon"
    t.datetime "last_clicked_at"
    t.boolean "pinned", default: false, null: false
    t.integer "position", null: false
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.string "url", null: false
    t.index ["category_id", "position"], name: "index_websites_on_category_id_and_position"
    t.index ["category_id"], name: "index_websites_on_category_id"
    t.index ["clicks_count"], name: "index_websites_on_clicks_count"
    t.index ["pinned"], name: "index_websites_on_pinned"
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "secrets", "websites"
  add_foreign_key "taggings", "tags"
  add_foreign_key "taggings", "websites"
  add_foreign_key "websites", "categories"
end
