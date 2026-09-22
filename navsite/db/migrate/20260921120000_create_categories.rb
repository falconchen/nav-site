class CreateCategories < ActiveRecord::Migration[8.1]
  def change
    create_table :categories do |t|
      t.string  :name, null: false
      t.string  :icon, null: false, default: "fas fa-folder"
      t.integer :position, null: false
      # builtin 而非 system：system 会遮蔽 Kernel#system
      t.boolean :builtin, null: false, default: false

      t.timestamps
    end

    add_index :categories, :position
  end
end
