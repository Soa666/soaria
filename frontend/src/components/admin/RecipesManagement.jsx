import { useState, useEffect } from 'react';
import api from '../../services/api';
import './RecipesManagement.css';

function RecipesManagement() {
  const [activeTab, setActiveTab] = useState('crafting'); // 'crafting' or 'equipment'
  
  // Crafting Recipes State
  const [recipes, setRecipes] = useState([]);
  const [items, setItems] = useState([]);
  const [buildings, setBuildings] = useState([]);
  
  // Equipment Recipes State
  const [equipmentRecipes, setEquipmentRecipes] = useState([]);
  const [equipmentTypes, setEquipmentTypes] = useState([]);
  const [availableImages, setAvailableImages] = useState([]);
  const [showImageSelector, setShowImageSelector] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editingRecipe, setEditingRecipe] = useState(null);
  
  // Crafting Recipe Form
  const [formData, setFormData] = useState({
    result_item_id: '',
    result_quantity: 1,
    required_workbench_level: 0,
    required_building_id: '',
    required_building_level: 1,
    ingredients: [{ item_id: '', quantity: 1 }]
  });

  // Equipment Recipe Form
  const [equipmentFormData, setEquipmentFormData] = useState({
    equipment_type_id: '',
    profession: 'blacksmith',
    required_profession_level: 1,
    experience_reward: 10,
    craft_time: 60,
    // Equipment type properties
    base_attack: 0,
    base_defense: 0,
    base_health: 0,
    image_path: '',
    materials: [{ item_id: '', quantity: 1 }]
  });

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (message || error) {
      const timer = setTimeout(() => {
        setMessage('');
        setError('');
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [message, error]);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([
      fetchRecipes(),
      fetchItems(),
      fetchBuildings(),
      fetchEquipmentRecipes(),
      fetchEquipmentTypes(),
      fetchAvailableImages()
    ]);
    setLoading(false);
  };

  const fetchAvailableImages = async () => {
    try {
      const response = await api.get('/files/items');
      setAvailableImages(response.data.images || []);
    } catch (error) {
      console.error('Fehler beim Laden der Bilder:', error);
    }
  };

  const fetchRecipes = async () => {
    try {
      const response = await api.get('/crafting/recipes');
      setRecipes(response.data.recipes || []);
    } catch (err) {
      console.error('Fehler beim Laden der Rezepte:', err);
    }
  };

  const fetchItems = async () => {
    try {
      const response = await api.get('/items');
      setItems(response.data.items || []);
    } catch (err) {
      console.error('Fehler beim Laden der Items:', err);
    }
  };

  const fetchBuildings = async () => {
    try {
      const response = await api.get('/crafting/buildings');
      setBuildings(response.data.buildings || []);
    } catch (err) {
      console.error('Fehler beim Laden der Gebäude:', err);
    }
  };

  const fetchEquipmentRecipes = async () => {
    try {
      const response = await api.get('/equipment/recipes/all');
      setEquipmentRecipes(response.data.recipes || []);
    } catch (err) {
      console.error('Fehler beim Laden der Equipment-Rezepte:', err);
    }
  };

  const fetchEquipmentTypes = async () => {
    try {
      const response = await api.get('/admin/equipment-types');
      setEquipmentTypes(response.data.equipmentTypes || []);
    } catch (err) {
      console.error('Fehler beim Laden der Equipment-Typen:', err);
    }
  };

  // ========== CRAFTING RECIPES ==========
  const addIngredient = () => {
    setFormData({
      ...formData,
      ingredients: [...formData.ingredients, { item_id: '', quantity: 1 }]
    });
  };

  const removeIngredient = (index) => {
    setFormData({
      ...formData,
      ingredients: formData.ingredients.filter((_, i) => i !== index)
    });
  };

  const updateIngredient = (index, field, value) => {
    const newIngredients = [...formData.ingredients];
    newIngredients[index][field] = field === 'quantity' ? parseInt(value) || 1 : value;
    setFormData({ ...formData, ingredients: newIngredients });
  };

  const resetForm = () => {
    setFormData({
      result_item_id: '',
      result_quantity: 1,
      required_workbench_level: 0,
      required_building_id: '',
      required_building_level: 1,
      ingredients: [{ item_id: '', quantity: 1 }]
    });
    setEditingRecipe(null);
  };

  const handleEdit = (recipe) => {
    setEditingRecipe(recipe);
    setFormData({
      result_item_id: recipe.result_item_id,
      result_quantity: recipe.result_quantity,
      required_workbench_level: recipe.required_workbench_level || 0,
      required_building_id: recipe.required_building_id || '',
      required_building_level: recipe.required_building_level || 1,
      ingredients: recipe.ingredients.map(ing => ({
        item_id: ing.item_id,
        quantity: ing.quantity
      }))
    });
  };

  const handleDelete = async (recipe) => {
    if (!confirm(`Rezept für "${recipe.result_display_name}" wirklich löschen?`)) {
      return;
    }

    try {
      await api.delete(`/crafting/recipes/${recipe.id}`);
      setMessage('Rezept gelöscht!');
      fetchRecipes();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Löschen');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');

    if (!formData.result_item_id) {
      setError('Bitte wähle ein Ergebnis-Item');
      return;
    }

    if (formData.ingredients.length === 0 || formData.ingredients.some(ing => !ing.item_id)) {
      setError('Bitte füge mindestens eine Zutat hinzu');
      return;
    }

    try {
      const payload = {
        ...formData,
        required_building_id: formData.required_building_id || null
      };

      if (editingRecipe) {
        await api.put(`/crafting/recipes/${editingRecipe.id}`, payload);
        setMessage('Rezept aktualisiert!');
      } else {
        await api.post('/crafting/recipes', payload);
        setMessage('Rezept erstellt!');
      }
      
      resetForm();
      fetchRecipes();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Speichern des Rezepts');
    }
  };

  // ========== EQUIPMENT RECIPES ==========
  const addMaterial = () => {
    setEquipmentFormData({
      ...equipmentFormData,
      materials: [...equipmentFormData.materials, { item_id: '', quantity: 1 }]
    });
  };

  const removeMaterial = (index) => {
    setEquipmentFormData({
      ...equipmentFormData,
      materials: equipmentFormData.materials.filter((_, i) => i !== index)
    });
  };

  const updateMaterial = (index, field, value) => {
    const newMaterials = [...equipmentFormData.materials];
    newMaterials[index][field] = field === 'quantity' ? parseInt(value) || 1 : value;
    setEquipmentFormData({ ...equipmentFormData, materials: newMaterials });
  };

  const resetEquipmentForm = () => {
    setEquipmentFormData({
      equipment_type_id: '',
      profession: 'blacksmith',
      required_profession_level: 1,
      experience_reward: 10,
      craft_time: 60,
      base_attack: 0,
      base_defense: 0,
      base_health: 0,
      image_path: '',
      materials: [{ item_id: '', quantity: 1 }]
    });
    setEditingRecipe(null);
  };

  const handleEditEquipment = (recipe) => {
    setEditingRecipe(recipe);
    // Get equipment type details
    const equipmentType = equipmentTypes.find(et => et.id === recipe.equipment_type_id);
    setEquipmentFormData({
      equipment_type_id: recipe.equipment_type_id,
      profession: recipe.profession || 'blacksmith',
      required_profession_level: recipe.required_profession_level || 1,
      experience_reward: recipe.experience_reward || 10,
      craft_time: recipe.craft_time || 60,
      // Equipment type properties
      base_attack: equipmentType?.base_attack || 0,
      base_defense: equipmentType?.base_defense || 0,
      base_health: equipmentType?.base_health || 0,
      image_path: equipmentType?.image_path || '',
      materials: recipe.materials?.length > 0 
        ? recipe.materials.map(mat => ({
            item_id: mat.item_id,
            quantity: mat.quantity
          }))
        : [{ item_id: '', quantity: 1 }]
    });
  };

  const handleDeleteEquipment = async (recipe) => {
    if (!confirm(`Equipment-Rezept für "${recipe.equipment_display_name}" wirklich löschen?`)) {
      return;
    }

    try {
      await api.delete(`/equipment/recipes/${recipe.id}`);
      setMessage('Equipment-Rezept gelöscht!');
      fetchEquipmentRecipes();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Löschen');
    }
  };

  const handleEquipmentSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');

    if (!equipmentFormData.equipment_type_id) {
      setError('Bitte wähle einen Equipment-Typ');
      return;
    }

    if (equipmentFormData.materials.length === 0 || equipmentFormData.materials.some(mat => !mat.item_id)) {
      setError('Bitte füge mindestens ein Material hinzu');
      return;
    }

    try {
      if (editingRecipe) {
        // Update recipe
        await api.put(`/equipment/recipes/${editingRecipe.id}`, equipmentFormData);
        
        // Update equipment type properties if editing
        if (equipmentFormData.equipment_type_id) {
          await api.put(`/equipment/types/${equipmentFormData.equipment_type_id}`, {
            base_attack: equipmentFormData.base_attack,
            base_defense: equipmentFormData.base_defense,
            base_health: equipmentFormData.base_health,
            image_path: equipmentFormData.image_path
          });
        }
        
        setMessage('Equipment-Rezept und Item-Werte aktualisiert!');
      } else {
        await api.post('/equipment/recipes', equipmentFormData);
        setMessage('Equipment-Rezept erstellt!');
      }
      
      resetEquipmentForm();
      fetchEquipmentRecipes();
      fetchEquipmentTypes(); // Refresh equipment types to show updated values
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Speichern');
    }
  };

  if (loading) {
    return <div className="loading">Lädt...</div>;
  }

  const selectedBuilding = buildings.find(b => b.id === parseInt(formData.required_building_id));
  const professionLabels = {
    blacksmith: '⚒️ Schmied',
    carpenter: '🪚 Schreiner',
    leatherworker: '🧵 Gerber',
    jeweler: '💎 Juwelier'
  };

  // Equipment ohne Rezept (für Dropdown)
  const unassignedEquipment = equipmentTypes.filter(
    et => !equipmentRecipes.some(r => r.equipment_type_id === et.id) || 
          (editingRecipe && editingRecipe.equipment_type_id === et.id)
  );

  return (
    <div className="recipes-management">
      <div className="recipes-header">
        <h2>📜 Rezepte verwalten</h2>
        <p className="header-description">Crafting-Rezepte und Schmiede-Rezepte</p>
      </div>

      {/* Tab Navigation */}
      <div className="recipe-tabs">
        <button 
          className={`tab-btn ${activeTab === 'crafting' ? 'active' : ''}`}
          onClick={() => { setActiveTab('crafting'); resetForm(); resetEquipmentForm(); }}
        >
          🔧 Crafting-Rezepte ({recipes.length})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'equipment' ? 'active' : ''}`}
          onClick={() => { setActiveTab('equipment'); resetForm(); resetEquipmentForm(); }}
        >
          ⚔️ Schmiede-Rezepte ({equipmentRecipes.length})
        </button>
      </div>

      {message && <div className="success-message">{message}</div>}
      {error && <div className="error-message">{error}</div>}

      {/* ========== CRAFTING TAB ========== */}
      {activeTab === 'crafting' && (
        <>
          <div className="recipe-form-card">
            <h3>{editingRecipe ? '✏️ Rezept bearbeiten' : '✨ Neues Crafting-Rezept'}</h3>
            
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Ergebnis-Item</label>
                  <select
                    value={formData.result_item_id}
                    onChange={(e) => setFormData({ ...formData, result_item_id: e.target.value })}
                    required
                  >
                    <option value="">-- Item wählen --</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.display_name} ({item.type})
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group">
                  <label>Ergebnis-Menge</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.result_quantity}
                    onChange={(e) => setFormData({ ...formData, result_quantity: parseInt(e.target.value) || 1 })}
                    required
                  />
                </div>
              </div>

              <div className="form-section">
                <h4>🏠 Gebäude-Anforderungen</h4>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Benötigtes Gebäude</label>
                    <select
                      value={formData.required_building_id}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        required_building_id: e.target.value,
                        required_building_level: 1
                      })}
                    >
                      <option value="">Keins (nur Werkbank)</option>
                      {buildings.map((building) => (
                        <option key={building.id} value={building.id}>
                          {building.display_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {formData.required_building_id && (
                    <div className="form-group">
                      <label>Gebäude-Level</label>
                      <input
                        type="number"
                        min="1"
                        max={selectedBuilding?.max_level || 10}
                        value={formData.required_building_level}
                        onChange={(e) => setFormData({ ...formData, required_building_level: parseInt(e.target.value) || 1 })}
                      />
                    </div>
                  )}

                  <div className="form-group">
                    <label>Werkbank-Level</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.required_workbench_level}
                      onChange={(e) => setFormData({ ...formData, required_workbench_level: parseInt(e.target.value) || 0 })}
                    />
                    <span className="hint">0 = keine Werkbank nötig</span>
                  </div>
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h4>🧪 Zutaten</h4>
                  <button type="button" onClick={addIngredient} className="btn-add-ingredient">
                    + Zutat
                  </button>
                </div>
                
                <div className="ingredients-list">
                  {formData.ingredients.map((ingredient, index) => (
                    <div key={index} className="ingredient-row">
                      <select
                        value={ingredient.item_id}
                        onChange={(e) => updateIngredient(index, 'item_id', e.target.value)}
                        className="ingredient-select"
                      >
                        <option value="">-- Item wählen --</option>
                        {items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.display_name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        value={ingredient.quantity}
                        onChange={(e) => updateIngredient(index, 'quantity', e.target.value)}
                        placeholder="Menge"
                        className="ingredient-quantity"
                      />
                      {formData.ingredients.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeIngredient(index)}
                          className="btn-remove"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-actions">
                {editingRecipe && (
                  <button type="button" onClick={resetForm} className="btn-cancel">
                    Abbrechen
                  </button>
                )}
                <button type="submit" className="btn-primary">
                  {editingRecipe ? '💾 Speichern' : '✨ Erstellen'}
                </button>
              </div>
            </form>
          </div>

          <div className="recipes-list-card">
            <h3>📋 Crafting-Rezepte ({recipes.length})</h3>
            
            <table className="recipes-table">
              <thead>
                <tr>
                  <th>Ergebnis</th>
                  <th>Menge</th>
                  <th>Gebäude</th>
                  <th>Werkbank</th>
                  <th>Zutaten</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {recipes.map((recipe) => (
                  <tr key={recipe.id}>
                    <td className="result-cell">
                      {recipe.result_image_path && (
                        <img 
                          src={`/items/${recipe.result_image_path}`} 
                          alt={recipe.result_display_name}
                          className="item-icon"
                        />
                      )}
                      <span>{recipe.result_display_name}</span>
                    </td>
                    <td>{recipe.result_quantity}x</td>
                    <td>
                      {recipe.required_building_id ? (
                        <span className="building-badge">
                          🏠 {recipe.building_display_name} Lv.{recipe.required_building_level || 1}
                        </span>
                      ) : (
                        <span className="no-requirement">-</span>
                      )}
                    </td>
                    <td>
                      {recipe.required_workbench_level > 0 ? (
                        <span className="workbench-badge">
                          🔨 Lv.{recipe.required_workbench_level}
                        </span>
                      ) : (
                        <span className="no-requirement">-</span>
                      )}
                    </td>
                    <td className="ingredients-cell">
                      {recipe.ingredients.map((ing, idx) => (
                        <span key={idx} className="ingredient-tag">
                          {ing.quantity}x {ing.display_name}
                        </span>
                      ))}
                    </td>
                    <td className="action-cell">
                      <button 
                        className="btn-icon btn-edit" 
                        onClick={() => handleEdit(recipe)}
                        title="Bearbeiten"
                      >
                        ✏️
                      </button>
                      <button 
                        className="btn-icon btn-delete" 
                        onClick={() => handleDelete(recipe)}
                        title="Löschen"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
                {recipes.length === 0 && (
                  <tr>
                    <td colSpan="6" className="empty-row">
                      Noch keine Crafting-Rezepte vorhanden
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ========== EQUIPMENT TAB ========== */}
      {activeTab === 'equipment' && (
        <>
          <div className="recipe-form-card">
            <h3>{editingRecipe ? '✏️ Schmiede-Rezept bearbeiten' : '⚔️ Neues Schmiede-Rezept'}</h3>
            
            <form onSubmit={handleEquipmentSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Equipment-Typ</label>
                  <select
                    value={equipmentFormData.equipment_type_id}
                    onChange={(e) => {
                      const selectedType = equipmentTypes.find(et => et.id === parseInt(e.target.value));
                      setEquipmentFormData({ 
                        ...equipmentFormData, 
                        equipment_type_id: e.target.value,
                        base_attack: selectedType?.base_attack || 0,
                        base_defense: selectedType?.base_defense || 0,
                        base_health: selectedType?.base_health || 0,
                        image_path: selectedType?.image_path || ''
                      });
                    }}
                    required
                  >
                    <option value="">-- Equipment wählen --</option>
                    {(editingRecipe ? equipmentTypes : unassignedEquipment).map((et) => (
                      <option key={et.id} value={et.id}>
                        {et.display_name} ({et.slot})
                      </option>
                    ))}
                  </select>
                  {!editingRecipe && unassignedEquipment.length === 0 && (
                    <span className="hint warning">Alle Equipment-Typen haben bereits Rezepte</span>
                  )}
                </div>

                <div className="form-group">
                  <label>Beruf</label>
                  <select
                    value={equipmentFormData.profession}
                    onChange={(e) => setEquipmentFormData({ ...equipmentFormData, profession: e.target.value })}
                  >
                    {Object.entries(professionLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>Benötigtes Berufs-Level</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={equipmentFormData.required_profession_level}
                    onChange={(e) => setEquipmentFormData({ ...equipmentFormData, required_profession_level: parseInt(e.target.value) || 1 })}
                  />
                </div>

                <div className="form-group">
                  <label>Erfahrung (EP)</label>
                  <input
                    type="number"
                    min="0"
                    value={equipmentFormData.experience_reward}
                    onChange={(e) => setEquipmentFormData({ ...equipmentFormData, experience_reward: parseInt(e.target.value) || 0 })}
                  />
                </div>

                <div className="form-group">
                  <label>Herstellungszeit (Sek.)</label>
                  <input
                    type="number"
                    min="1"
                    value={equipmentFormData.craft_time}
                    onChange={(e) => setEquipmentFormData({ ...equipmentFormData, craft_time: parseInt(e.target.value) || 60 })}
                  />
                  <span className="hint">{Math.floor(equipmentFormData.craft_time / 60)}:{(equipmentFormData.craft_time % 60).toString().padStart(2, '0')} Min.</span>
                </div>
              </div>

              {/* Equipment Stats Section */}
              {editingRecipe && (
                <div className="form-section">
                  <h4>⚔️ Item-Werte</h4>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>⚔️ Angriff</label>
                      <input
                        type="number"
                        min="0"
                        value={equipmentFormData.base_attack}
                        onChange={(e) => setEquipmentFormData({ ...equipmentFormData, base_attack: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="form-group">
                      <label>🛡️ Verteidigung</label>
                      <input
                        type="number"
                        min="0"
                        value={equipmentFormData.base_defense}
                        onChange={(e) => setEquipmentFormData({ ...equipmentFormData, base_defense: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="form-group">
                      <label>❤️ Gesundheit</label>
                      <input
                        type="number"
                        min="0"
                        value={equipmentFormData.base_health}
                        onChange={(e) => setEquipmentFormData({ ...equipmentFormData, base_health: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Image Path Section */}
              {editingRecipe && (
                <div className="form-section">
                  <h4>🖼️ Bild</h4>
                  <div className="form-group">
                    <label>
                      Bild-Pfad
                      <button 
                        type="button" 
                        onClick={() => setShowImageSelector(!showImageSelector)}
                        className="btn btn-secondary btn-small"
                        style={{ marginLeft: '1rem' }}
                      >
                        {showImageSelector ? 'Auswahl schließen' : 'Bild auswählen'}
                      </button>
                    </label>
                    <input
                      type="text"
                      value={equipmentFormData.image_path}
                      onChange={(e) => setEquipmentFormData({ ...equipmentFormData, image_path: e.target.value })}
                      placeholder="z.B. sword_iron.png"
                    />
                    <small>Pfad relativ zum /items/ Verzeichnis</small>
                    {equipmentFormData.image_path && (
                      <div className="image-preview" style={{ marginTop: '0.5rem' }}>
                        <img 
                          src={`/items/${equipmentFormData.image_path}`} 
                          alt="Preview" 
                          style={{ 
                            maxWidth: '100px', 
                            maxHeight: '100px', 
                            border: '2px solid #5a4a2a',
                            borderRadius: '4px',
                            padding: '4px'
                          }}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      </div>
                    )}
                    {showImageSelector && (
                      <div className="image-selector">
                        <h4>Verfügbare Bilder:</h4>
                        <div className="image-grid">
                          {availableImages.map((img) => (
                            <div
                              key={img.filename}
                              className={`image-option ${equipmentFormData.image_path === img.filename ? 'selected' : ''}`}
                              onClick={() => {
                                setEquipmentFormData({ ...equipmentFormData, image_path: img.filename });
                                setShowImageSelector(false);
                              }}
                            >
                              <img 
                                src={`/items/${img.filename}`} 
                                alt={img.filename}
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                              <span>{img.filename}</span>
                            </div>
                          ))}
                        </div>
                        {availableImages.length === 0 && (
                          <p style={{ color: '#8b7a5a', fontStyle: 'italic', marginTop: '0.5rem' }}>
                            Keine Bilder gefunden. Bitte lege Bilder in den /items Ordner.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="form-section">
                <div className="section-header">
                  <h4>📦 Materialien</h4>
                  <button type="button" onClick={addMaterial} className="btn-add-ingredient">
                    + Material
                  </button>
                </div>
                
                <div className="ingredients-list">
                  {equipmentFormData.materials.map((material, index) => (
                    <div key={index} className="ingredient-row">
                      <select
                        value={material.item_id}
                        onChange={(e) => updateMaterial(index, 'item_id', e.target.value)}
                        className="ingredient-select"
                      >
                        <option value="">-- Item wählen --</option>
                        {items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.display_name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        value={material.quantity}
                        onChange={(e) => updateMaterial(index, 'quantity', e.target.value)}
                        placeholder="Menge"
                        className="ingredient-quantity"
                      />
                      {equipmentFormData.materials.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeMaterial(index)}
                          className="btn-remove"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-actions">
                {editingRecipe && (
                  <button type="button" onClick={resetEquipmentForm} className="btn-cancel">
                    Abbrechen
                  </button>
                )}
                <button type="submit" className="btn-primary">
                  {editingRecipe ? '💾 Speichern' : '⚔️ Erstellen'}
                </button>
              </div>
            </form>
          </div>

          <div className="recipes-list-card">
            <h3>⚔️ Schmiede-Rezepte ({equipmentRecipes.length})</h3>
            
            <table className="recipes-table">
              <thead>
                <tr>
                  <th>Equipment</th>
                  <th>Slot</th>
                  <th>Beruf / Level</th>
                  <th>Zeit</th>
                  <th>EP</th>
                  <th>Materialien</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {equipmentRecipes.map((recipe) => (
                  <tr key={recipe.id}>
                    <td className="result-cell">
                      {recipe.equipment_image_path && (
                        <img 
                          src={`/items/${recipe.equipment_image_path}`} 
                          alt={recipe.equipment_display_name}
                          className="item-icon"
                        />
                      )}
                      <span>{recipe.equipment_display_name}</span>
                    </td>
                    <td>
                      <span className="slot-badge">{recipe.slot}</span>
                    </td>
                    <td>
                      <span className="profession-badge">
                        {professionLabels[recipe.profession] || recipe.profession} Lv.{recipe.required_profession_level}
                      </span>
                    </td>
                    <td>
                      {Math.floor(recipe.craft_time / 60)}:{(recipe.craft_time % 60).toString().padStart(2, '0')}
                    </td>
                    <td>
                      <span className="exp-badge">+{recipe.experience_reward} EP</span>
                    </td>
                    <td className="ingredients-cell">
                      {recipe.materials?.length > 0 ? (
                        recipe.materials.map((mat, idx) => (
                          <span key={idx} className="ingredient-tag">
                            {mat.quantity}x {mat.display_name}
                          </span>
                        ))
                      ) : (
                        <span className="no-requirement">Keine</span>
                      )}
                    </td>
                    <td className="action-cell">
                      <button 
                        className="btn-icon btn-edit" 
                        onClick={() => handleEditEquipment(recipe)}
                        title="Bearbeiten"
                      >
                        ✏️
                      </button>
                      <button 
                        className="btn-icon btn-delete" 
                        onClick={() => handleDeleteEquipment(recipe)}
                        title="Löschen"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
                {equipmentRecipes.length === 0 && (
                  <tr>
                    <td colSpan="7" className="empty-row">
                      Noch keine Schmiede-Rezepte vorhanden
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default RecipesManagement;
