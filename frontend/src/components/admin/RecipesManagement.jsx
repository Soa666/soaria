import { useState, useEffect } from 'react';
import api from '../../services/api';
import './RecipesManagement.css';

function RecipesManagement() {
  const [recipes, setRecipes] = useState([]);
  const [items, setItems] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [formData, setFormData] = useState({
    result_item_id: '',
    result_quantity: 1,
    required_workbench_level: 0,
    required_building_id: '',
    required_building_level: 1,
    ingredients: [{ item_id: '', quantity: 1 }]
  });

  useEffect(() => {
    fetchRecipes();
    fetchItems();
    fetchBuildings();
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

  const fetchRecipes = async () => {
    try {
      const response = await api.get('/crafting/recipes');
      setRecipes(response.data.recipes);
    } catch (err) {
      console.error('Fehler beim Laden der Rezepte:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchItems = async () => {
    try {
      const response = await api.get('/items');
      setItems(response.data.items);
    } catch (err) {
      console.error('Fehler beim Laden der Items:', err);
    }
  };

  const fetchBuildings = async () => {
    try {
      const response = await api.get('/crafting/buildings');
      setBuildings(response.data.buildings);
    } catch (err) {
      console.error('Fehler beim Laden der Gebäude:', err);
    }
  };

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

  if (loading) {
    return <div className="loading">Lädt...</div>;
  }

  const selectedBuilding = buildings.find(b => b.id === parseInt(formData.required_building_id));

  return (
    <div className="recipes-management">
      <div className="recipes-header">
        <h2>📜 Crafting-Rezepte</h2>
      </div>

      {message && <div className="success-message">{message}</div>}
      {error && <div className="error-message">{error}</div>}

      {/* Recipe Form */}
      <div className="recipe-form-card">
        <h3>{editingRecipe ? '✏️ Rezept bearbeiten' : '✨ Neues Rezept erstellen'}</h3>
        
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

      {/* Recipe List */}
      <div className="recipes-list-card">
        <h3>📋 Alle Rezepte ({recipes.length})</h3>
        
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
                  Noch keine Rezepte vorhanden
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default RecipesManagement;
